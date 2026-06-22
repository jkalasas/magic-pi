/**
 * /btw — side-chat modal backed by a throwaway pi sub-session.
 *
 * Spawns a separate `pi --mode rpc --no-session --agent-mode ask` subprocess
 * (an isolated context window) and drives it from an overlay chat modal. The
 * sub-session is seeded with a compact transcript of the current session so
 * "by the way" questions can be asked against the work in progress without
 * polluting the main conversation.
 *
 * The modal is a floating overlay: a scrollable transcript above a single-line
 * input. Enter sends a prompt to the subprocess, text deltas stream into the
 * transcript live, Esc aborts a running response or closes the modal when idle.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import {
	type Component,
	type Focusable,
	Input,
	type TUI,
	matchesKey,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { type ExtensionCommandContext, type ThemeColor } from "@earendil-works/pi-coding-agent";

const MAX_SEED_MESSAGES = 12;
const MAX_SEED_CHARS_PER_MESSAGE = 1200;
const MAX_TRANSCRIPT_ENTRIES = 400;
/** Modal width is 94% of the terminal, capped so ultrawide monitors stay readable. */
const MODAL_WIDTH_RATIO = 0.94;
const MODAL_WIDTH_CAP = 150;

// ---------------------------------------------------------------------------
// Subprocess invocation
// ---------------------------------------------------------------------------

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) return { command: process.execPath, args };
	return { command: "pi", args };
}

// ---------------------------------------------------------------------------
// Mouse scroll (SGR mouse mode)
// ---------------------------------------------------------------------------

/** SGR mouse sequence: ESC[<B;X;YM  (M = press, m = release). */
const SGR_MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;

const MOUSE_SCROLL_LINES = 3;

/** Enable SGR mouse reporting (basic mode — wheel + clicks). */
function enableMouseScroll(terminal: { write: (data: string) => void }): void {
	terminal.write("\x1b[?1000h\x1b[?1006h");
}

/** Disable SGR mouse reporting. */
function disableMouseScroll(terminal: { write: (data: string) => void }): void {
	terminal.write("\x1b[?1006l\x1b[?1000l");
}

// ---------------------------------------------------------------------------
// Seed context: compact transcript of the current session
// ---------------------------------------------------------------------------

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (block && typeof block === "object") {
			const b = block as { type?: string; text?: string };
			if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
		}
	}
	return parts.join("\n");
}

export function buildSeedContext(ctx: ExtensionCommandContext): string {
	const branch = ctx.sessionManager.getBranch();
	const msgs: { role: "user" | "assistant"; text: string }[] = [];

	for (const entry of branch) {
		if (entry.type !== "message") continue;
		const msg = entry.message as { role?: string; content?: unknown };
		if (msg.role !== "user" && msg.role !== "assistant") continue;

		const text = extractText(msg.content);
		if (!text || !text.trim()) continue;

		const trimmed = text.trim();
		if (msg.role === "user" && (trimmed.startsWith("!") || trimmed.startsWith("/"))) continue;

		msgs.push({ role: msg.role as "user" | "assistant", text: trimmed });
	}

	const recent = msgs.slice(-MAX_SEED_MESSAGES);
	if (recent.length === 0) return "";

	const lines: string[] = ["Recent conversation from the parent session:"];
	for (const m of recent) {
		const role = m.role === "user" ? "User" : "Assistant";
		const body = m.text.length > MAX_SEED_CHARS_PER_MESSAGE ? `${m.text.slice(0, MAX_SEED_CHARS_PER_MESSAGE)}…` : m.text;
		lines.push(`${role}: ${body}`);
	}
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Sub-session RPC client
// ---------------------------------------------------------------------------

interface RpcEvent {
	type: string;
	[key: string]: unknown;
}

class SubSession {
	private proc: ChildProcessWithoutNullStreams;
	private buffer = "";
	private listeners: ((event: RpcEvent) => void)[] = [];
	private closed = false;
	onExit?: (code: number | null) => void;
	onError?: (err: Error) => void;

	constructor(command: string, args: string[], cwd: string) {
		this.proc = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"], shell: false });
		this.proc.stdout.on("data", (data: Buffer) => {
			this.buffer += data.toString();
			const lines = this.buffer.split("\n");
			this.buffer = lines.pop() || "";
			for (const line of lines) this.dispatch(line);
		});
		this.proc.stderr.on("data", () => {});
		this.proc.on("error", (err) => {
			this.closed = true;
			this.onError?.(err);
		});
		this.proc.on("exit", (code) => {
			this.closed = true;
			this.onExit?.(code);
		});
	}

	private dispatch(line: string): void {
		const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
		if (!trimmed.trim()) return;
		try {
			const event = JSON.parse(trimmed) as RpcEvent;
			for (const l of this.listeners) l(event);
		} catch {
			// ignore non-JSON noise on stdout
		}
	}

	on(listener: (event: RpcEvent) => void): void {
		this.listeners.push(listener);
	}

	send(obj: Record<string, unknown>): void {
		if (this.closed) return;
		try {
			this.proc.stdin.write(`${JSON.stringify(obj)}\n`);
		} catch {
			// pipe closed during shutdown
		}
	}

	abort(): void {
		this.send({ type: "abort" });
	}

	kill(): void {
		if (this.closed) return;
		try {
			this.proc.kill("SIGTERM");
			setTimeout(() => {
				if (!this.closed) {
					try {
						this.proc.kill("SIGKILL");
					} catch {
						// already gone
					}
				}
			}, 2000);
		} catch {
			// already gone
		}
	}
}

// ---------------------------------------------------------------------------
// Transcript log
// ---------------------------------------------------------------------------

interface TranscriptEntry {
	prefix: string;
	prefixColor: string;
	text: string;
}

class Transcript {
	private entries: TranscriptEntry[] = [];
	private scrollOffset = 0;
	private stickToBottom = true;

	append(entry: TranscriptEntry): void {
		this.entries.push(entry);
		if (this.entries.length > MAX_TRANSCRIPT_ENTRIES) {
			this.entries = this.entries.slice(-MAX_TRANSCRIPT_ENTRIES);
		}
		this.stickToBottom = true;
	}

	appendRaw(text: string): void {
		if (this.entries.length === 0) {
			this.entries.push({ prefix: "", prefixColor: "", text });
		} else {
			this.entries[this.entries.length - 1]!.text += text;
		}
		this.stickToBottom = true;
	}

	scrollUp(n: number): void {
		this.stickToBottom = false;
		this.scrollOffset += n;
	}

	scrollDown(n: number): void {
		this.scrollOffset = Math.max(0, this.scrollOffset - n);
		if (this.scrollOffset === 0) this.stickToBottom = true;
	}

	/** Snap back to the bottom (newest lines). */
	stickToBottomNow(): void {
		this.scrollOffset = 0;
		this.stickToBottom = true;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines: string[] = [];
		for (const entry of this.entries) {
			const prefix = entry.prefix ? `${entry.prefixColor}${entry.prefix} ` : "";
			const prefixWidth = entry.prefix ? visibleWidth(entry.prefix) + 1 : 0;
			if (prefixWidth >= width) {
				lines.push(prefix.slice(0, width));
				continue;
			}
			const wrapped = wrapTextWithAnsi(entry.text, Math.max(1, width - prefixWidth));
			const cont = " ".repeat(prefixWidth);
			for (let i = 0; i < wrapped.length; i++) {
				lines.push(`${i === 0 ? prefix : cont}${wrapped[i]}`);
			}
			if (wrapped.length === 0) lines.push(prefix.trimEnd());
		}
		return lines;
	}

	/** Return the visible slice of rendered lines for a given viewport height. */
	viewport(rendered: string[], height: number): string[] {
		if (this.stickToBottom || this.scrollOffset === 0) {
			return rendered.slice(-height);
		}
		const end = Math.max(height, rendered.length - this.scrollOffset);
		const start = end - height;
		return rendered.slice(Math.max(0, start), end);
	}
}

// ---------------------------------------------------------------------------
// Overlay modal
// ---------------------------------------------------------------------------

interface BtwTheme {
	fg: (color: ThemeColor, text: string) => string;
	bold: (text: string) => string;
}

interface BtwModalDeps {
	tui: TUI;
	theme: BtwTheme;
	sub: SubSession;
	hasSeed: boolean;
	onClose: () => void;
}

class BtwModal implements Component, Focusable {
	focused = false;

	private deps: BtwModalDeps;
	private transcript = new Transcript();
	private input: Input;
	private streaming = false;

	constructor(deps: BtwModalDeps) {
		this.deps = deps;
		this.input = new Input();
		this.input.onSubmit = (value) => this.submit(value);
		// Esc is handled in handleInput before reaching the Input component, so
		// onEscape here is just a fallback no-op.
		this.input.onEscape = () => {};
		if (deps.hasSeed) {
			this.transcript.append({
				prefix: "",
				prefixColor: deps.theme.fg("dim", ""),
				text: deps.theme.fg("dim", "Seeded with the current session transcript. Ask away."),
			});
			this.transcript.append({ prefix: "", prefixColor: "", text: "" });
		}
		deps.sub.on((event) => this.handleRpcEvent(event));
		deps.sub.onExit = (code) => this.handleExit(code);
		deps.sub.onError = (err) => this.handleError(err);
		enableMouseScroll(deps.tui.terminal);
	}

	private handleRpcEvent(event: RpcEvent): void {
		switch (event.type) {
			case "agent_start":
				this.streaming = true;
				this.transcript.append({ prefix: "Assistant:", prefixColor: this.deps.theme.fg("accent", ""), text: "" });
				this.deps.tui.requestRender();
				return;

			case "message_update": {
				const evt = event.assistantMessageEvent as { type?: string; delta?: string } | undefined;
				if (evt?.type === "text_delta" && typeof evt.delta === "string") {
					this.appendDelta(evt.delta);
					this.deps.tui.requestRender();
				}
				return;
			}

			case "tool_execution_start": {
				const name = String(event.toolName ?? "tool");
				this.transcript.append({
					prefix: "→",
					prefixColor: this.deps.theme.fg("muted", ""),
					text: this.deps.theme.fg("muted", name),
				});
				this.deps.tui.requestRender();
				return;
			}

			case "agent_end":
				this.streaming = false;
				this.transcript.append({ prefix: "", prefixColor: "", text: "" });
				this.deps.tui.requestRender();
				return;

			case "response":
				if (event.success === false) {
					this.streaming = false;
					this.transcript.append({
						prefix: "",
						prefixColor: this.deps.theme.fg("error", ""),
						text: this.deps.theme.fg("error", `error: ${String(event.error ?? "unknown")}`),
					});
					this.deps.tui.requestRender();
				}
				return;

			case "extension_ui_request": {
				// Side chat never blocks on dialogs; auto-dismiss.
				const id = event.id as string | undefined;
				const method = event.method as string | undefined;
				if (id && method) {
					if (method === "confirm") {
						this.deps.sub.send({ type: "extension_ui_response", id, confirmed: false });
					} else {
						this.deps.sub.send({ type: "extension_ui_response", id, cancelled: true });
					}
				}
				return;
			}
		}
	}

	private handleExit(code: number | null): void {
		if (!this.streaming) return;
		this.streaming = false;
		this.transcript.append({
			prefix: "",
			prefixColor: this.deps.theme.fg("error", ""),
			text: this.deps.theme.fg("error", `(sub-session exited${code !== null && code !== 0 ? ` with code ${code}` : ""})`),
		});
		this.deps.tui.requestRender();
	}

	private handleError(err: Error): void {
		this.streaming = false;
		this.transcript.append({
			prefix: "",
			prefixColor: this.deps.theme.fg("error", ""),
			text: this.deps.theme.fg("error", `failed to start sub-session: ${err.message}`),
		});
		this.deps.tui.requestRender();
	}

	private appendDelta(delta: string): void {
		const parts = delta.split("\n");
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) {
				this.transcript.append({ prefix: "", prefixColor: this.deps.theme.fg("accent", ""), text: "" });
			}
			if (parts[i]) this.transcript.appendRaw(parts[i]!);
		}
	}

	private sendPrompt(text: string): void {
		this.transcript.append({
			prefix: "You:",
			prefixColor: this.deps.theme.fg("success", ""),
			text,
		});
		this.deps.sub.send({ type: "prompt", message: text });
		this.deps.tui.requestRender();
	}

	handleInput(data: string): void {
		// Mouse wheel: SGR mouse sequence ESC[<B;X;YM. Button 64 = wheel up, 65 = down.
		const mouse = data.match(SGR_MOUSE_RE);
		if (mouse) {
			const button = Number(mouse[1]);
			// Bit 6 (64) = wheel event; bit 0 distinguishes up (0) vs down (1).
			// Ignore modifier bits (shift/alt/ctrl) so wheel+modifier still scrolls.
			if (button & 64) {
				const down = (button & 1) === 1;
				if (down) {
					if (!this.streaming) this.transcript.scrollDown(MOUSE_SCROLL_LINES);
				} else {
					if (!this.streaming) this.transcript.scrollUp(MOUSE_SCROLL_LINES);
				}
				this.deps.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, "escape")) {
			if (this.streaming) {
				this.deps.sub.abort();
				this.streaming = false;
				this.transcript.append({
					prefix: "",
					prefixColor: this.deps.theme.fg("warning", ""),
					text: this.deps.theme.fg("warning", "(aborted)"),
				});
			} else {
				this.close();
			}
			this.deps.tui.requestRender();
			return;
		}

		if (matchesKey(data, "up")) {
			if (!this.streaming) this.transcript.scrollUp(1);
			this.deps.tui.requestRender();
			return;
		}
		if (matchesKey(data, "down")) {
			if (!this.streaming) this.transcript.scrollDown(1);
			this.deps.tui.requestRender();
			return;
		}

		// Everything else (typing, Ctrl+W, Ctrl+U, Ctrl+K, word movement, paste,
		// undo, Enter-via-onSubmit) is handled by the Input component, which
		// supports the full readline-style keybinding set.
		this.input.handleInput(data);
		this.deps.tui.requestRender();
	}

	private submit(value: string): void {
		const text = value.trim();
		if (this.streaming) return;
		if (!text) return;
		this.input.setValue("");
		this.transcript.stickToBottomNow();
		this.sendPrompt(text);
	}

	private close(): void {
		disableMouseScroll(this.deps.tui.terminal);
		this.deps.sub.kill();
		this.deps.onClose();
	}

	dispose(): void {
		disableMouseScroll(this.deps.tui.terminal);
		this.deps.sub.kill();
	}

	invalidate(): void {}

	render(width: number): string[] {
		const w = width;
		const innerW = Math.max(1, w - 2);
		const th = this.deps.theme;
		const border = (s: string) => th.fg("border", s);
		const pad = (s: string, len: number) => s + " ".repeat(Math.max(0, len - visibleWidth(s)));
		const row = (content: string) => `${border("│")}${pad(content, innerW)}${border("│")}`;

		const lines: string[] = [];
		lines.push(border(`╭${"─".repeat(innerW)}╮`));
		lines.push(row(` ${th.fg("accent", th.bold(" btw — side chat "))}${th.fg("dim", "(ask mode)")}`));
		lines.push(border(`├${"─".repeat(innerW)}┤`));

		// Match the overlay's own height clamp so the bottom (input/footer/border)
		// is never clipped. The overlay caps at min(maxHeight%, termHeight - margins)
		// and slices off the BOTTOM when content overflows, so we must render exactly
		// that many lines. overlayOptions: { maxHeight: "80%", margin: { top:1, bottom:1 } }.
		const termHeight = this.deps.tui.terminal.rows || 24;
		const availHeight = Math.max(1, termHeight - 2); // margin top+bottom = 1 each
		const overlayMax = Math.min(Math.floor(termHeight * 0.8), availHeight);
		// Fixed lines: top border, header, sep, bottom sep, input, footer, bottom border = 7.
		const reserved = 7;
		const totalHeight = Math.max(reserved + 1, overlayMax);
		const transcriptHeight = Math.max(1, totalHeight - reserved);

		const rendered = this.transcript.render(innerW - 1);
		const visible = this.transcript.viewport(rendered, transcriptHeight);
		for (const line of visible) lines.push(row(` ${line}`));
		for (let i = visible.length; i < transcriptHeight; i++) lines.push(row(""));

		lines.push(border(`├${"─".repeat(innerW)}┤`));

		// Input line: delegate rendering to the Input component so it gets the
		// same cursor display, horizontal scrolling, and styling as the main
		// editor. Sync focus so the cursor marker is emitted when we're focused.
		this.input.focused = this.focused;
		const prefix = th.fg("success", th.bold("You: "));
		const prefixW = visibleWidth("You: ");
		const inputLines = this.input.render(Math.max(1, innerW - prefixW - 1));
		const inputText = inputLines[0] ?? "";
		lines.push(row(` ${prefix}${inputText}`));
		lines.push(row(` ${th.fg("dim", "Enter send • Esc abort/close • ↑↓ scroll")}`));
		lines.push(border(`╰${"─".repeat(innerW)}╯`));

		return lines;
	}
}

// ---------------------------------------------------------------------------
// Temp prompt file
// ---------------------------------------------------------------------------

async function writeTempPrompt(content: string): Promise<{ path: string; cleanup: () => void }> {
	const os = await import("node:os");
	const fs = await import("node:fs/promises");
	const path = await import("node:path");
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-btw-"));
	const filePath = path.join(dir, "context.md");
	await fs.writeFile(filePath, content, { encoding: "utf-8", mode: 0o600 });
	return {
		path: filePath,
		cleanup: () => {
			fs.unlink(filePath).catch(() => {});
			fs.rmdir(dir).catch(() => {});
		},
	};
}

function buildSystemPrompt(seedContext: string): string {
	const head = [
		"You are the /btw side chat: a read-only assistant (ask mode) answering quick questions about the user's current pi session.",
		"You are a SEPARATE session from the main one. Do NOT make changes to files. Answer and explain only.",
		"Keep answers concise and concrete. Quote file paths and lines when relevant.",
		"",
	];
	const parts = [...head];
	if (seedContext) {
		parts.push(seedContext, "");
	}
	return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function openBtwModal(ctx: ExtensionCommandContext): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("/btw requires interactive mode", "error");
		return;
	}

	const seedContext = buildSeedContext(ctx);
	const cwd = ctx.cwd;

	const args = ["--mode", "rpc", "--no-session", "--agent-mode", "ask"];
	if (ctx.model) args.push("--model", `${ctx.model.provider}/${ctx.model.id}`);

	const tmpPrompt = await writeTempPrompt(buildSystemPrompt(seedContext));
	args.push("--append-system-prompt", tmpPrompt.path);

	const invocation = getPiInvocation(args);
	const sub = new SubSession(invocation.command, invocation.args, cwd);

	let disposed = false;
	const cleanup = () => {
		if (disposed) return;
		disposed = true;
		sub.kill();
		tmpPrompt.cleanup();
	};

	try {
		const termCols = process.stdout.columns ?? 80;
		const modalWidth = Math.max(60, Math.min(Math.floor(termCols * MODAL_WIDTH_RATIO), MODAL_WIDTH_CAP));
		await ctx.ui.custom<undefined>(
			(tui, theme, _kb, done) =>
				new BtwModal({
					tui,
					theme,
					sub,
					hasSeed: seedContext.length > 0,
					onClose: () => done(undefined),
				}),
			{
				overlay: true,
				overlayOptions: {
					width: modalWidth,
					maxHeight: "80%",
					anchor: "center",
					margin: { top: 1, bottom: 1 },
				},
			},
		);
	} finally {
		cleanup();
	}
}
