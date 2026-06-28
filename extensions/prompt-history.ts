/**
 * Prompt History Extension
 * ------------------------
 * Persists submitted prompts to disk so the editor's built-in up/down
 * history navigation scrolls across every previous session, not just the
 * current one.
 *
 * - Up arrow on the first visual line recalls the previous prompt.
 * - Down arrow on the last visual line moves forward.
 * - History survives restarts, /new, /resume, /fork, and /reload.
 *
 * Storage is tracked per folder: each project (identified by its cwd) gets
 * its own file under ~/.pi/agent/prompt-history/. The filename is a sanitized
 * form of the absolute cwd so the files are human-inspectable. Each file holds
 * one JSON-encoded entry per line, oldest first (append order). Consecutive
 * duplicates are collapsed; each folder's file is capped at MAX_ENTRIES
 * entries (oldest trimmed).
 *
 * Slash commands (input starting with "/") are not recorded — only prompts
 * that actually go to the agent.
 */

import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme } from "@earendil-works/pi-tui";
import type { TUI } from "@earendil-works/pi-tui";

const HISTORY_DIR = join(homedir(), ".pi", "agent", "prompt-history");
const MAX_ENTRIES = 1000;

type Entry = { text: string; ts: number };

function historyFileFor(cwd: string): string {
  const name = cwd.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return join(HISTORY_DIR, (name || "default") + ".jsonl");
}

function parseLine(line: string): Entry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as Partial<Entry>;
    if (typeof obj.text === "string" && obj.text.trim()) {
      return { text: obj.text, ts: typeof obj.ts === "number" ? obj.ts : 0 };
    }
  } catch {
    return { text: trimmed, ts: 0 };
  }
  return null;
}

function readHistory(cwd: string): Entry[] {
  let raw: string;
  try {
    raw = readFileSync(historyFileFor(cwd), "utf8");
  } catch {
    return [];
  }
  const entries: Entry[] = [];
  for (const line of raw.split("\n")) {
    const entry = parseLine(line);
    if (entry) entries.push(entry);
  }
  return entries; // oldest first (file/append order)
}

async function appendHistory(cwd: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const file = historyFileFor(cwd);
  const existing = readHistory(cwd);
  const newest = existing[existing.length - 1];
  if (newest && newest.text === trimmed) return; // collapse consecutive dup

  const entry: Entry = { text: trimmed, ts: Date.now() };
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(entry) + "\n", "utf8");

  if (existing.length + 1 > MAX_ENTRIES) {
    const kept = [...existing, entry].slice(-MAX_ENTRIES); // drop oldest
    const data = kept.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await writeFile(file, data, "utf8");
  }
}

/**
 * Editor that preloads persisted history into the built-in editor history on
 * construction. Extends CustomEditor so all app keybindings (escape, ctrl+d,
 * model switching, etc.) keep working.
 */
class HistoryEditor extends CustomEditor {
  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    private readonly cwd: string,
  ) {
    super(tui, theme, keybindings);
    this.preload();
  }

  private preload(): void {
    const entries = readHistory(this.cwd); // oldest first
    // addToHistory unshifts to history[0]; replay oldest -> newest so the
    // newest prompt lands at history[0].
    for (const entry of entries) {
      this.addToHistory(entry.text);
    }
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    const cwd = ctx.cwd;
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new HistoryEditor(tui, theme, keybindings, cwd),
    );
  });

  pi.on("input", async (event, ctx) => {
    if (event.source !== "interactive") return;
    const text = event.text.trim();
    if (!text || text.startsWith("/")) return;
    await appendHistory(ctx.cwd, text);
  });
}
