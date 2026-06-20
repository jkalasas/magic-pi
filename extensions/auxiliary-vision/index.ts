/**
 * Auxiliary Vision Extension
 *
 * Provides a `describe_image` tool for models that lack vision support.
 * When the main model cannot process images, this tool delegates to a
 * configured vision-capable model to analyze images and return text
 * descriptions back to the main model.
 *
 * Configuration: ~/.pi/agent/vision-settings.json
 * {
 *   "provider": "anthropic",
 *   "model": "claude-sonnet-4-5"
 * }
 *
 * The tool only appears when the active model does NOT support image input.
 * When you switch to a vision-capable model, the tool is automatically hidden.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VisionSettings {
  provider: string;
  model: string;
}

interface DescribeImageDetails {
  visionModel: string;
  imageCount: number;
  imagePaths: string[];
  objective: string;
  exitCode: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SETTINGS_PATH = path.join(os.homedir(), ".pi", "agent", "vision-settings.json");

const DEFAULT_SETTINGS: VisionSettings = {
  provider: "anthropic",
  model: "claude-sonnet-4-5",
};

function loadSettings(): VisionSettings {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
      return {
        provider: raw.provider || DEFAULT_SETTINGS.provider,
        model: raw.model || DEFAULT_SETTINGS.model,
      };
    }
  } catch (err) {
    console.error("[auxiliary-vision] Failed to load settings:", err);
  }
  return { ...DEFAULT_SETTINGS };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp",
  ".svg", ".ico", ".tiff", ".tif",
]);

function validateImagePaths(imagePaths: string[], cwd: string): string[] {
  const absolutePaths: string[] = [];
  for (const img of imagePaths) {
    const absPath = path.resolve(cwd, img);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Image file not found: ${absPath}`);
    }
    const ext = path.extname(absPath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new Error(
        `Unsupported image format '${ext}'. Supported: ${[...SUPPORTED_EXTENSIONS].join(", ")}`,
      );
    }
    absolutePaths.push(absPath);
  }
  return absolutePaths;
}

/** Check whether a model supports image input. */
function modelHasVision(model: { input?: string[] } | undefined | null): boolean {
  if (!model?.input || !Array.isArray(model.input)) return false;
  return model.input.includes("image");
}

/** Resolve the pi invocation command and args for spawning subprocesses. */
function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (currentScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  // Fall back to `pi` on PATH (e.g. when pi is run via a wrapper)
  return { command: "pi", args };
}

// ---------------------------------------------------------------------------
// Subprocess: run a vision-capable pi instance to describe images
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  "You are an image analysis assistant. Your job is to inspect images and answer",
  "questions about them accurately and thoroughly.",
  "",
  "You MUST:",
  "1. Read EVERY image file listed in the task using the `read` tool before answering.",
  "2. Answer the user's objective/question about the images.",
  "3. Return ONLY your analysis as plain text — no conversational filler, no offers",
  "   to do additional work, no suggestions for next steps.",
  "",
  "Do NOT describe images without reading them first.",
  "Do NOT suggest further actions or offer to do additional work.",
  "Focus entirely on answering the objective about the images.",
].join("\n");

async function runVisionSubprocess(
  provider: string,
  model: string,
  task: string,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<{ exitCode: number; output: string; stderr: string }> {
  const modelSpec = `${provider}/${model}`;
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-aux-vision-"));
  const promptPath = path.join(tmpDir, "system-prompt.md");

  const result = { exitCode: 0, output: "", stderr: "" };
  let wasAborted = false;

  try {
    await fs.promises.writeFile(promptPath, SYSTEM_PROMPT, {
      encoding: "utf-8",
      mode: 0o600,
    });

    const args: string[] = [
      "--mode", "json",
      "-p",
      "--no-session",
      "--model", modelSpec,
      "--tools", "read",
      "--append-system-prompt", promptPath,
      `Task: ${task}`,
    ];

    result.exitCode = await new Promise<number>((resolve) => {
      const invocation = getPiInvocation(args);
      const proc = spawn(invocation.command, invocation.args, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdoutBuffer = "";
      let assistantOutput = "";

      const processLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line);
          if (event.type === "message_end" && event.message?.role === "assistant") {
            const content = event.message.content;
            if (Array.isArray(content)) {
              for (const part of content) {
                if (
                  typeof part === "object" &&
                  part !== null &&
                  "type" in part &&
                  part.type === "text" &&
                  "text" in part
                ) {
                  assistantOutput = (part as { text: string }).text;
                }
              }
            }
          }
        } catch {
          /* skip non-JSON lines (e.g. stderr interleaving) */
        }
      };

      proc.stdout.on("data", (data: Buffer) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (data: Buffer) => {
        result.stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (stdoutBuffer.trim()) processLine(stdoutBuffer);
        result.output = assistantOutput;
        resolve(code ?? 0);
      });

      proc.on("error", () => {
        resolve(1);
      });

      if (signal) {
        const killProc = () => {
          wasAborted = true;
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!proc.killed) proc.kill("SIGKILL");
          }, 5000);
        };
        if (signal.aborted) {
          killProc();
        } else {
          signal.addEventListener("abort", killProc, { once: true });
        }
      }
    });

    if (wasAborted) {
      throw new Error("Image description was aborted");
    }

    return result;
  } finally {
    try {
      fs.unlinkSync(promptPath);
    } catch {
      /* ignore */
    }
    try {
      fs.rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const DescribeImageParams = Type.Object({
  images: Type.Array(Type.String({ description: "Local file path to an image" }), {
    description: "One or more local image file paths to describe",
  }),
  objective: Type.String({
    description:
      "What you want to know about the image(s). Be specific — e.g. 'What UI components are visible?', 'Describe the code shown in this screenshot', 'What errors are present?'",
  }),
});

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function auxiliaryVisionExtension(pi: ExtensionAPI) {
  let settings = loadSettings();

  // -----------------------------------------------------------------------
  // Tool visibility management
  // -----------------------------------------------------------------------

  function isToolActive(): boolean {
    return pi.getActiveTools().includes("describe_image");
  }

  function enableTool() {
    if (isToolActive()) return;
    const active = pi.getActiveTools();
    pi.setActiveTools([...active, "describe_image"]);
    console.error(
      `[auxiliary-vision] Tool enabled — main model lacks vision. Using ${settings.provider}/${settings.model} as fallback.`,
    );
  }

  function disableTool() {
    if (!isToolActive()) return;
    pi.setActiveTools(pi.getActiveTools().filter((t) => t !== "describe_image"));
    console.error("[auxiliary-vision] Tool disabled — main model supports vision natively.");
  }

  function syncToolVisibility(model: { input?: string[] } | undefined | null) {
    if (modelHasVision(model)) {
      disableTool();
    } else {
      enableTool();
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  pi.on("session_start", (_event, ctx) => {
    // Reload settings on new sessions
    settings = loadSettings();
    // Sync tool visibility against the currently active model
    syncToolVisibility(ctx.model);
  });

  pi.on("model_select", (event) => {
    // When the user switches models, re-evaluate visibility
    syncToolVisibility(event.model);
  });

  // -----------------------------------------------------------------------
  // Tool registration
  // -----------------------------------------------------------------------

  pi.registerTool({
    name: "describe_image",
    label: "Describe Image",
    description: [
      "Analyze one or more images using an auxiliary vision model when the main model cannot see images.",
      "Provide local file paths and an objective describing what you want to know.",
      "A vision-capable subagent reads the images and returns a plain text description.",
      "Use this tool whenever you need to understand image content but cannot view images directly.",
      "Supported formats: PNG, JPG, JPEG, GIF, WebP, BMP, SVG, TIFF.",
    ].join(" "),
    promptSnippet: "Describe images using an auxiliary vision model",
    promptGuidelines: [
      "Use describe_image whenever you need to understand image content but cannot view images directly.",
      "Always provide a specific, focused objective for best results — e.g. 'What UI elements are shown?' rather than just 'Describe this.'",
      "You can pass multiple image paths to compare or cross-reference them in a single call.",
    ],
    parameters: DescribeImageParams,

    async execute(
      _toolCallId: string,
      params: { images: string[]; objective: string },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: DescribeImageDetails;
      isError?: boolean;
    }> {
      const { images, objective } = params;
      const visionModel = `${settings.provider}/${settings.model}`;

      const baseDetails: DescribeImageDetails = {
        visionModel,
        imageCount: images.length,
        imagePaths: images,
        objective,
        exitCode: 0,
        durationMs: 0,
      };

      // --- Validate inputs ---
      if (!images || images.length === 0) {
        return {
          content: [
            { type: "text", text: "No images provided. Pass at least one image file path." },
          ],
          isError: true,
          details: { ...baseDetails, exitCode: 1 },
        };
      }

      if (images.length > 10) {
        return {
          content: [
            {
              type: "text",
              text: `Too many images (${images.length}). Maximum is 10 per call.`,
            },
          ],
          isError: true,
          details: { ...baseDetails, exitCode: 1 },
        };
      }

      let absolutePaths: string[];
      try {
        absolutePaths = validateImagePaths(images, ctx.cwd);
      } catch (err) {
        return {
          content: [
            { type: "text", text: err instanceof Error ? err.message : String(err) },
          ],
          isError: true,
          details: { ...baseDetails, exitCode: 1 },
        };
      }

      // --- Build task for the vision subprocess ---
      const imageList = absolutePaths.map((p) => `  - ${p}`).join("\n");
      const task = [
        `Read and analyze the following image(s):`,
        imageList,
        "",
        `Objective: ${objective}`,
        "",
        "Remember: Read each image file using the read tool first, then answer the objective.",
      ].join("\n");

      // --- Run the vision subprocess ---
      const startTime = Date.now();

      try {
        const subResult = await runVisionSubprocess(
          settings.provider,
          settings.model,
          task,
          ctx.cwd,
          signal,
        );
        const durationMs = Date.now() - startTime;

        if (subResult.exitCode !== 0 || !subResult.output) {
          const errorMsg =
            subResult.stderr || subResult.output || "Vision subprocess failed with no output.";
          console.error(`[auxiliary-vision] Subprocess failed (exit ${subResult.exitCode}):`, errorMsg);
          return {
            content: [
              {
                type: "text",
                text: [
                  `Image analysis failed (exit code ${subResult.exitCode}).`,
                  `Make sure the vision model '${visionModel}' is configured and has a valid API key.`,
                  subResult.stderr ? `\nStderr:\n${subResult.stderr.slice(0, 500)}` : "",
                ]
                  .filter(Boolean)
                  .join("\n"),
              },
            ],
            isError: true,
            details: {
              ...baseDetails,
              imagePaths: absolutePaths,
              exitCode: subResult.exitCode,
              durationMs,
            },
          };
        }

        return {
          content: [{ type: "text", text: subResult.output }],
          details: {
            ...baseDetails,
            imagePaths: absolutePaths,
            exitCode: 0,
            durationMs,
          },
        };
      } catch (err) {
        const durationMs = Date.now() - startTime;
        console.error("[auxiliary-vision] Error running vision subprocess:", err);
        return {
          content: [
            {
              type: "text",
              text: `Image analysis error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
          details: {
            ...baseDetails,
            imagePaths: absolutePaths,
            exitCode: 1,
            durationMs,
          },
        };
      }
    },

    // --- Custom rendering ---
    renderCall(args, theme) {
      const imageCount = args.images?.length ?? 0;
      const preview =
        args.objective && args.objective.length > 60
          ? `${args.objective.slice(0, 60)}...`
          : args.objective || "(no objective)";

      let text = theme.fg("toolTitle", theme.bold("describe_image "));
      text += theme.fg("accent", `${imageCount} image${imageCount !== 1 ? "s" : ""}`);
      text += "\n  " + theme.fg("dim", preview);

      if (args.images && args.images.length <= 4) {
        for (const img of args.images) {
          const name = path.basename(img);
          text += "\n  " + theme.fg("dim", `🖼 ${name}`);
        }
      }

      return new Text(text, 0, 0);
    },

    renderResult(result, options, theme) {
      const details = result.details as DescribeImageDetails | undefined;
      const icon = result.isError
        ? theme.fg("error", "✗")
        : theme.fg("success", "✓");

      let text = icon + " " + theme.fg("toolTitle", theme.bold("describe_image"));

      if (details?.visionModel) {
        text += theme.fg("muted", ` (${details.visionModel})`);
      }
      if (details?.durationMs) {
        const seconds = (details.durationMs / 1000).toFixed(1);
        text += theme.fg("dim", ` ${seconds}s`);
      }

      const output = result.content?.[0];
      if (output?.type === "text") {
        if (options.expanded) {
          text += "\n" + theme.fg("toolOutput", output.text);
        } else {
          const lines = output.text.split("\n");
          const previewLines = lines.slice(0, 5);
          text += "\n" + theme.fg("toolOutput", previewLines.join("\n"));
          if (lines.length > 5) {
            text += theme.fg(
              "muted",
              `\n... (${lines.length - 5} more lines — expand to view)`,
            );
          }
        }
      }

      return new Text(text, 0, 0);
    },
  });
}
