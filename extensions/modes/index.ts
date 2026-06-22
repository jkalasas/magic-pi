/**
 * Modes Extension
 *
 * Adds switchable agent modes similar to opencode's Plan / Build modes.
 * Modes are defined as Markdown files in a `modes/` directory and can be
 * cycled through with Tab (when the input editor is empty) or picked via
 * the `/mode` command.
 *
 * Mode directories (merged, project takes precedence):
 *   <PI_CODING_AGENT_DIR>/modes/*.md   (global, i.e. getAgentDir()/modes)
 *   <cwd>/.pi/modes/*.md               (project-local)
 *
 * The filename (without `.md`) is the mode name. There is always a built-in
 * mode called `pi` which is the default pi behavior — it loads nothing and
 * injects no extra system prompt.
 *
 * Mode file format (Markdown):
 *
 *   ---
 *   description: Read-only exploration and planning
 *   tools: read, bash, grep, find, ls
 *   thinking: high
 *   model: anthropic/claude-sonnet-4-5
 *   ---
 *
 *   You are in BRAINSTORM mode. Your job is to turn a vague idea into a
 *   validated design...
 *
 * The token `{{agent_dir}}` in a mode body is replaced with getAgentDir() at
 * injection time, so modes can reference agent-dir-relative paths such as the
 * spec/plan store (`{{agent_dir}}/pi-magics/...`) or skills bundled with this
 * extension (`{{agent_dir}}/extensions/modes/skills/...`).
 *
 * The YAML-ish frontmatter is optional. Supported fields:
 *   - description: short label shown in the mode selector / footer
 *   - tools: comma-separated tool names to activate (whitelist; replaces active set)
 *   - disabled-tools: comma-separated tool names to disable (blocklist; subtracted
 *     after `tools`). Prefer this for read-only modes — it is future-proof
 *     against new built-in, extension, and MCP tools.
 *   - thinking: thinking level (off|minimal|low|medium|high|xhigh)
 *   - model: model to switch to, as <provider>/<model> (e.g. anthropic/claude-sonnet-4-5)
 *
 * If neither `tools` nor `disabled-tools` is given, the active tool set is
 * left untouched (use this for "full access" modes). If both are given, the
 * whitelist is applied first and the blocklist is subtracted from it.
 *
 * The body (after the frontmatter) is injected into the system prompt as
 * additional instructions for every turn while the mode is active. For the
 * built-in `pi` mode, no body is injected.
 *
 * Usage:
 *   - Tab               cycle to next mode (only when the editor is empty)
 *   - /mode             open the mode selector
 *   - /mode <name>      switch to a specific mode directly
 *   - /mode pi          return to default pi behavior
 *   - /btw              open a side-chat modal (separate ask-mode sub-session)
 *   - --agent-mode <name>     start in a mode (CLI flag)
 *
 * This extension lives in a folder (`extensions/modes/`) so it can bundle its
 * own supporting skills under `extensions/modes/skills/` (e.g. `writing.md`,
 * used by the `plan` mode). Modes reference them via `{{agent_dir}}`.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
	CustomEditor,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
	SelectList,
	decodeKittyPrintable,
	matchesKey,
	type EditorTheme,
	type SelectItem,
	type TUI,
} from "@earendil-works/pi-tui";
import { openBtwModal } from "./btw.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** Parsed `model: <provider>/<model>` frontmatter field. */
interface ModeModel {
	provider: string;
	id: string;
}

interface Mode {
	/** Mode name (filename without .md), or "pi" for the built-in default. */
	name: string;
	/** Short description for the selector / footer. */
	description: string;
	/**
	 * Whitelist of tool names to activate (replaces the active set). If absent,
	 * the active set is left intact (or filtered only by `disabledTools`).
	 */
	tools?: string[];
	/**
	 * Blocklist of tool names to disable. Applied after `tools`. The common
	 * case for read-only modes: `disabled-tools: edit, write` instead of
	 * enumerating every allowed tool. Future-proof against new built-in,
	 * extension, and MCP tools.
	 */
	disabledTools?: string[];
	/** Thinking level to apply when this mode is selected. */
	thinking?: ThinkingLevel;
	/** Model to switch to when this mode is selected, as <provider>/<id>. */
	model?: ModeModel;
	/** System-prompt instructions injected each turn. Empty for the `pi` mode. */
	instructions: string;
	/** Whether this is the built-in default mode that loads nothing. */
	isPi: boolean;
	/** Where the mode was loaded from (for diagnostics). */
	source: string;
}

interface PersistedState {
	activeMode: string;
}

// ---------------------------------------------------------------------------
// Mode loading
// ---------------------------------------------------------------------------

const PI_MODE: Mode = {
	name: "pi",
	description: "Default pi behavior (no extra instructions)",
	instructions: "",
	isPi: true,
	source: "<builtin>",
};

/**
 * Parse optional YAML-ish frontmatter from a markdown mode file.
 * Only recognizes the small set of fields we care about. The parser is
 * intentionally simple: `key: value` lines, comma-separated lists.
 */
function parseModeFile(name: string, content: string, source: string): Mode {
	let body = content;
	let description = "";
	let tools: string[] | undefined;
	let disabledTools: string[] | undefined;
	let thinking: ThinkingLevel | undefined;
	let model: ModeModel | undefined;

	// Frontmatter is delimited by leading `---` on its own line.
	if (content.startsWith("---")) {
		const endMatch = content.match(/\n---\s*(?:\n|$)/);
		if (endMatch && endMatch.index !== undefined) {
			const headerEnd = endMatch.index + endMatch[0].length;
			const header = content.slice(3, endMatch.index); // between first --- and \n---
			body = content.slice(headerEnd).trimStart();

			for (const rawLine of header.split("\n")) {
				const line = rawLine.trim();
				if (!line || line.startsWith("#")) continue;
				const colon = line.indexOf(":");
				if (colon === -1) continue;
				const key = line.slice(0, colon).trim().toLowerCase();
				const value = line.slice(colon + 1).trim();
				if (key === "description") {
					description = value;
				} else if (key === "tools") {
					tools = value
						.split(",")
						.map((t) => t.trim())
						.filter(Boolean);
					if (tools.length === 0) tools = undefined;
				} else if (key === "disabled-tools" || key === "disabledtools") {
					disabledTools = value
						.split(",")
						.map((t) => t.trim())
						.filter(Boolean);
					if (disabledTools.length === 0) disabledTools = undefined;
				} else if (key === "thinking") {
					const v = value.toLowerCase() as ThinkingLevel;
					if (
						v === "off" ||
						v === "minimal" ||
						v === "low" ||
						v === "medium" ||
						v === "high" ||
						v === "xhigh"
					) {
						thinking = v;
					}
				} else if (key === "model") {
					const slash = value.indexOf("/");
					if (slash > 0 && slash < value.length - 1) {
						model = {
							provider: value.slice(0, slash).trim(),
							id: value.slice(slash + 1).trim(),
						};
					}
				}
			}
		}
	}

	return {
		name,
		description: description || name,
		tools,
		disabledTools,
		thinking,
		model,
		instructions: body.trim(),
		isPi: false,
		source,
	};
}

function loadModesFromDir(dir: string): Mode[] {
	const modes: Mode[] = [];
	if (!existsSync(dir)) return modes;
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return modes;
	}
	for (const entry of entries) {
		if (!entry.toLowerCase().endsWith(".md")) continue;
		const path = join(dir, entry);
		const name = entry.slice(0, -3);
		if (name.toLowerCase() === "pi") continue; // `pi` is always built-in
		try {
			const content = readFileSync(path, "utf-8");
			modes.push(parseModeFile(name, content, path));
		} catch (err) {
			console.error(`[modes] Failed to read ${path}: ${err}`);
		}
	}
	return modes;
}

/**
 * Load all modes. The built-in `pi` mode is always first. Global modes from
 * the agent dir come next, then project-local modes (which override globals
 * with the same name).
 */
function loadModes(cwd: string): Mode[] {
	const globalDir = join(getAgentDir(), "modes");
	const projectDir = join(cwd, ".pi", "modes");

	const globalModes = loadModesFromDir(globalDir);
	const projectModes = loadModesFromDir(projectDir);

	// Merge: project modes override global modes with the same name.
	const byName = new Map<string, Mode>();
	for (const m of globalModes) byName.set(m.name.toLowerCase(), m);
	for (const m of projectModes) byName.set(m.name.toLowerCase(), m);

	const merged = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
	return [PI_MODE, ...merged];
}

// ---------------------------------------------------------------------------
// Custom editor: Tab cycles modes when the editor is empty
// ---------------------------------------------------------------------------

/**
 * Wraps the default editor so that Tab cycles the active mode, but only when
 * the editor is empty and the autocomplete dropdown is not open. Otherwise Tab
 * is passed through unchanged, preserving normal autocomplete/indent behavior.
 */
class ModeEditor extends CustomEditor {
	private onCycleMode: () => void;

	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, onCycleMode: () => void) {
		super(tui, theme, keybindings);
		this.onCycleMode = onCycleMode;
	}

	handleInput(data: string): void {
		// Only intercept a bare Tab when there's nothing to autocomplete against
		// and no dropdown is visible. This keeps autocomplete fully functional.
		if (matchesKey(data, "tab") && this.getText().trim().length === 0 && !this.isShowingAutocomplete()) {
			this.onCycleMode();
			return;
		}
		super.handleInput(data);
	}
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function modesExtension(pi: ExtensionAPI): void {
	let modes: Mode[] = [PI_MODE];
	let activeMode: Mode = PI_MODE;
	// Snapshot of tools/thinking/model captured before the first non-pi mode is
	// applied, so switching back to `pi` restores the user's original config.
	let originalTools: string[] | undefined;
	let originalThinking: ThinkingLevel | undefined;
	let originalModel: Model<Api> | undefined;

	// --- CLI flag: start in a mode -----------------------------------------
	// Named --agent-mode to avoid colliding with pi's built-in --mode (output mode).
	pi.registerFlag("agent-mode", {
		description: "Start in a specific agent mode (e.g. --agent-mode plan)",
		type: "string",
	});

	// --- helpers ------------------------------------------------------------

	function refreshModes(cwd: string): void {
		modes = loadModes(cwd);
		// Keep activeMode valid if it still exists; otherwise fall back to pi.
		const stillExists = modes.find((m) => m.name.toLowerCase() === activeMode.name.toLowerCase());
		activeMode = stillExists ?? PI_MODE;
	}

	// A compact, single-glyph indicator so the footer and notifications share
	// one consistent visual language. `pi` mode shows no footer status at all.
	const MODE_INDICATOR = "◐";

	function modeLabel(m: Mode): string {
		return `${MODE_INDICATOR} ${m.name}`;
	}

	function updateStatus(ctx: ExtensionContext): void {
		ctx.ui.setStatus("modes", activeMode.isPi ? undefined : ctx.ui.theme.fg("accent", modeLabel(activeMode)));
	}

	function persistState(): void {
		pi.appendEntry("modes", { activeMode: activeMode.name } satisfies PersistedState);
	}

	/**
	 * Apply a mode: set tools / thinking if specified and update status.
	 * Returns true if the mode was found and applied.
	 */
	function applyMode(mode: Mode, ctx: ExtensionContext): boolean {
		// Snapshot original state the first time we leave the `pi` mode, so we
		// can restore it when switching back.
		if (activeMode.isPi && !mode.isPi) {
			originalTools = pi.getActiveTools();
			originalThinking = pi.getThinkingLevel();
			originalModel = ctx.model;
		}

		activeMode = mode;

		if (mode.isPi) {
			// Restore original tools/thinking/model if we have a snapshot.
			if (originalTools) pi.setActiveTools(originalTools);
			if (originalThinking) pi.setThinkingLevel(originalThinking);
			if (originalModel) void pi.setModel(originalModel);
		} else {
			// Compute the active tool set. `tools` is a whitelist (replaces the
			// active set); `disabledTools` is a blocklist (subtracted afterwards).
			// If neither is specified, the active set is left untouched — this is
			// how `build`-style modes can mean true "full access".
			const allToolNames = pi.getAllTools().map((t) => t.name);
			let active: string[] | undefined;
			if (mode.tools && mode.tools.length > 0) {
				active = mode.tools.filter((t) => allToolNames.includes(t));
			} else {
				active = pi.getActiveTools();
			}
			if (mode.disabledTools && mode.disabledTools.length > 0) {
				active = active.filter((t) => !mode.disabledTools!.includes(t));
			}
			if (active && active.length > 0) {
				pi.setActiveTools(active);
			}
			if (mode.thinking) {
				pi.setThinkingLevel(mode.thinking);
			}
			if (mode.model) {
				const target = ctx.modelRegistry.find(mode.model.provider, mode.model.id);
				if (target) void pi.setModel(target);
			}
		}

		updateStatus(ctx);
		persistState();
		return true;
	}

	function cycleMode(ctx: ExtensionContext): void {
		if (modes.length === 0) return;
		const currentIndex = modes.findIndex((m) => m.name.toLowerCase() === activeMode.name.toLowerCase());
		const nextIndex = (currentIndex + 1) % modes.length;
		const next = modes[nextIndex]!;
		applyMode(next, ctx);
	}

	/**
	 * Build the SelectItem list for the mode selector, marking the active mode.
	 */
	function modeSelectorItems(): SelectItem[] {
		return modes.map((m) => {
			const isActive = m.name.toLowerCase() === activeMode.name.toLowerCase();
			return {
				value: m.name,
				label: isActive ? `${MODE_INDICATOR} ${m.name}` : m.name,
				description: m.description,
			};
		});
	}

	/**
	 * Open the mode selector overlay with a type-to-filter search input.
	 *
	 * The search input sits above the list. Typing filters the list by mode
	 * name prefix (SelectList.setFilter), Backspace edits the query, and Esc
	 * clears the query (or closes the overlay if the query is already empty).
	 * Up/Down/Enter are passed through to the list for navigation and confirm.
	 *
	 * Used by the `/mode` command (no-arg form).
	 */
	async function openModeSelector(ctx: ExtensionContext): Promise<void> {
		if (modes.length === 0) return;
		const items = modeSelectorItems();

		const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			const selectList = new SelectList(items, Math.min(items.length, 12), {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			});

			selectList.onSelect = (item) => done(item.value);
			selectList.onCancel = () => done(null);

			let filter = "";

			const renderSearchLine = (width: number): string => {
				const promptLabel = "Search: ";
				const prompt = theme.fg("muted", promptLabel);
				const cursor = "\x1b[7m \x1b[27m"; // reverse-video block
				const visibleLen = promptLabel.length + filter.length + 1; // +1 for cursor
				const pad = " ".repeat(Math.max(0, width - visibleLen));
				return `${prompt}${filter}${cursor}${pad}`;
			};

			const setFilter = (next: string) => {
				filter = next;
				selectList.setFilter(filter);
				tui.requestRender();
			};

			return {
				render(width: number) {
					return [renderSearchLine(width), ...selectList.render(width)];
				},
				invalidate() {
					selectList.invalidate();
				},
				handleInput(data: string) {
					// Esc clears the query if non-empty, otherwise cancels.
					if (matchesKey(data, "escape")) {
						if (filter.length > 0) {
							setFilter("");
							return;
						}
						selectList.handleInput(data); // fires onCancel
						tui.requestRender();
						return;
					}

					// Backspace trims the query.
					if (matchesKey(data, "backspace")) {
						if (filter.length > 0) setFilter(filter.slice(0, -1));
						return;
					}

					// Kitty CSI-u printable character.
					const kitty = decodeKittyPrintable(data);
					if (kitty !== undefined) {
						setFilter(filter + kitty);
						return;
					}

					// Regular printable character (reject control bytes).
					const hasControl = [...data].some((ch) => {
						const code = ch.charCodeAt(0);
						return code < 32 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
					});
					if (!hasControl && data.length > 0) {
						setFilter(filter + data);
						return;
					}

					// Everything else (Up/Down/Enter/...) goes to the list.
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		});

		if (!result) return;
		const target = modes.find((m) => m.name === result);
		if (target) applyMode(target, ctx);
	}

	// --- commands -----------------------------------------------------------

	pi.registerCommand("btw", {
		description: "Open a side-chat modal (separate ask-mode sub-session) seeded with the current session.",
		handler: async (_args, ctx) => {
			await openBtwModal(ctx);
		},
	});

	pi.registerCommand("mode", {
		description: "Switch agent mode (e.g. /mode brainstorm). Run without args for a selector.",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (trimmed.length > 0) {
				const target = modes.find((m) => m.name.toLowerCase() === trimmed.toLowerCase());
				if (target) applyMode(target, ctx);
				return;
			}

			// No argument: open the searchable selector.
			await openModeSelector(ctx);
		},
	});

	// --- events -------------------------------------------------------------

	// Install the editor wrapper on session start. ModeEditor extends
	// CustomEditor (the same base pi's default editor uses), so it preserves
	// all default behavior including autocomplete and app keybindings; it only
	// adds a Tab-when-empty shortcut for cycling modes.
	pi.on("session_start", async (_event, ctx) => {
		refreshModes(ctx.cwd);

		// Restore persisted active mode.
		let restored = false;
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === "modes") {
				const data = entry.data as PersistedState | undefined;
				if (data?.activeMode) {
					const target = modes.find((m) => m.name.toLowerCase() === data.activeMode.toLowerCase());
					if (target) {
						activeMode = PI_MODE; // reset so applyMode snapshots correctly
						applyMode(target, ctx);
						restored = true;
					}
				}
			}
		}

		// CLI flag wins over persisted state.
		const flagMode = pi.getFlag("agent-mode");
		if (typeof flagMode === "string" && flagMode.length > 0) {
			const target = modes.find((m) => m.name.toLowerCase() === flagMode.toLowerCase());
			if (target) {
				activeMode = PI_MODE;
				applyMode(target, ctx);
			}
		}

		if (!restored && activeMode.isPi) {
			updateStatus(ctx);
		}

		// Wrap the editor so Tab cycles modes when empty.
		if (ctx.mode === "tui") {
			ctx.ui.setEditorComponent((tui, theme, keybindings) =>
				new ModeEditor(tui, theme, keybindings, () => cycleMode(ctx)),
			);
		}
	});

	// Re-discover modes on reload so newly added .md files show up.
	pi.on("resources_discover", async (_event, ctx) => {
		refreshModes(ctx.cwd);
		// ensure active mode still exists after refresh
		if (!modes.find((m) => m.name.toLowerCase() === activeMode.name.toLowerCase())) {
			activeMode = PI_MODE;
			updateStatus(ctx);
		}
	});

	// Inject the active mode's instructions into the system prompt each turn.
	// The token `{{agent_dir}}` is replaced with getAgentDir() so mode files can
	// reference agent-dir-relative paths (e.g. skills bundled in this extension
	// at `extensions/modes/skills/`, or the `pi-magics/` spec/plan store).
	pi.on("before_agent_start", async (event) => {
		if (activeMode.isPi || activeMode.instructions.length === 0) return;
		const instructions = activeMode.instructions.replaceAll("{{agent_dir}}", getAgentDir());
		return {
			systemPrompt: `${event.systemPrompt}\n\n--- ${activeMode.name} mode ---\n${instructions}\n--- end ${activeMode.name} mode ---`,
		};
	});
}
