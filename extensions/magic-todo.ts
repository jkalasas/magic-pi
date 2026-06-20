/**
 * Magic Todo Extension
 *
 * A temporary, in-memory todo list scoped to the current pi session.
 * - Todos are NOT persisted to the session file or disk.
 * - State lives in the extension's runtime and resets on new session / reload.
 * - Provides a `todo` tool for the LLM and a `/todos` slash command for users.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

interface Todo {
	id: number;
	text: string;
	done: boolean;
}

interface TodoDetails {
	action: "list" | "add" | "toggle" | "clear";
	todos: Todo[];
	nextId: number;
	error?: string;
}

const TodoParams = Type.Object({
	action: StringEnum(["list", "add", "toggle", "clear"] as const),
	text: Type.Optional(Type.String({ description: "Todo text (required for add)" })),
	id: Type.Optional(Type.Number({ description: "Todo ID (required for toggle)" })),
});

/**
 * UI component for the /todos command
 */
class TodoListComponent {
	private todos: Todo[];
	private theme: Theme;
	private onClose: () => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(todos: Todo[], theme: Theme, onClose: () => void) {
		this.todos = todos;
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const th = this.theme;

		lines.push("");
		const title = th.fg("accent", " Session Todos ");
		const headerLine =
			th.fg("borderMuted", "─".repeat(3)) +
			title +
			th.fg("borderMuted", "─".repeat(Math.max(0, width - 17)));
		lines.push(truncateToWidth(headerLine, width));
		lines.push("");

		if (this.todos.length === 0) {
			lines.push(
				truncateToWidth(
					`  ${th.fg("dim", "No todos yet. Ask the agent to add some, or type /todos anytime.")}`,
					width,
				),
			);
		} else {
			const done = this.todos.filter((t) => t.done).length;
			const total = this.todos.length;
			lines.push(truncateToWidth(`  ${th.fg("muted", `${done}/${total} completed`)}`, width));
			lines.push("");

			for (const todo of this.todos) {
				const check = todo.done ? th.fg("success", "✓") : th.fg("dim", "○");
				const id = th.fg("accent", `#${todo.id}`);
				const text = todo.done ? th.fg("dim", todo.text) : th.fg("text", todo.text);
				lines.push(truncateToWidth(`  ${check} ${id} ${text}`, width));
			}
		}

		lines.push("");
		lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width));
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

export default function (pi: ExtensionAPI) {
	// In-memory state only — intentionally not persisted across sessions/reloads.
	let todos: Todo[] = [];
	let nextId = 1;

	const updateWidget = (ctx: ExtensionContext) => {
		if (ctx.mode !== "tui") return;
		const done = todos.filter((t) => t.done).length;
		const total = todos.length;
		const lines = total === 0
			? [ctx.ui.theme.fg("dim", "No session todos")]
			: [
					ctx.ui.theme.fg("muted", `${done}/${total} todos`),
					...todos.map((t) => {
						const check = t.done ? ctx.ui.theme.fg("success", "✓") : ctx.ui.theme.fg("dim", "○");
						const id = ctx.ui.theme.fg("accent", `#${t.id}`);
						const text = t.done ? ctx.ui.theme.fg("dim", t.text) : ctx.ui.theme.fg("text", t.text);
						return `${check} ${id} ${text}`;
					}),
				];
		ctx.ui.setWidget("magic-todo", lines, { placement: "aboveEditor" });
	};

	pi.on("session_start", async (_event, ctx) => {
		// Reset state to guarantee the session-scoped, temporary behavior.
		todos = [];
		nextId = 1;
		updateWidget(ctx);
	});

	pi.registerTool({
		name: "todo",
		label: "Todo",
		description:
			"Manage a temporary, in-memory todo list for this session only. Actions: list, add (text), toggle (id), clear",
		parameters: TodoParams,
		promptSnippet: "Manage a temporary todo list for the current session",
		promptGuidelines: [
			"Use the todo tool when the user wants to create, view, or manage a temporary todo list for the current session.",
			"The todo tool is ephemeral and does not persist across sessions or reloads.",
		],

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			switch (params.action) {
				case "list": {
					const text = todos.length
						? todos.map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`).join("\n")
						: "No todos";
					updateWidget(ctx);
					return {
						content: [{ type: "text", text }],
						details: { action: "list", todos: [...todos], nextId } as TodoDetails,
					};
				}

				case "add": {
					if (!params.text) {
						updateWidget(ctx);
						return {
							content: [{ type: "text", text: "Error: text is required for add" }],
							details: {
								action: "add",
								todos: [...todos],
								nextId,
								error: "text required",
							} as TodoDetails,
						};
					}
					const newTodo: Todo = { id: nextId++, text: params.text, done: false };
					todos.push(newTodo);
					updateWidget(ctx);
					return {
						content: [{ type: "text", text: `Added todo #${newTodo.id}: ${newTodo.text}` }],
						details: { action: "add", todos: [...todos], nextId } as TodoDetails,
					};
				}

				case "toggle": {
					if (params.id === undefined) {
						updateWidget(ctx);
						return {
							content: [{ type: "text", text: "Error: id is required for toggle" }],
							details: {
								action: "toggle",
								todos: [...todos],
								nextId,
								error: "id required",
							} as TodoDetails,
						};
					}
					const todo = todos.find((t) => t.id === params.id);
					if (!todo) {
						updateWidget(ctx);
						return {
							content: [{ type: "text", text: `Todo #${params.id} not found` }],
							details: {
								action: "toggle",
								todos: [...todos],
								nextId,
								error: `#${params.id} not found`,
							} as TodoDetails,
						};
					}
					todo.done = !todo.done;
					updateWidget(ctx);
					return {
						content: [{ type: "text", text: `Todo #${todo.id} ${todo.done ? "completed" : "uncompleted"}` }],
						details: { action: "toggle", todos: [...todos], nextId } as TodoDetails,
					};
				}

				case "clear": {
					const count = todos.length;
					todos = [];
					nextId = 1;
					updateWidget(ctx);
					return {
						content: [{ type: "text", text: `Cleared ${count} todos` }],
						details: { action: "clear", todos: [], nextId: 1 } as TodoDetails,
					};
				}

				default:
					updateWidget(ctx);
					return {
						content: [{ type: "text", text: `Unknown action: ${params.action}` }],
						details: {
							action: "list",
							todos: [...todos],
							nextId,
							error: `unknown action: ${params.action}`,
						} as TodoDetails,
					};
			}
		},

		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", args.action);
			if (args.text) text += ` ${theme.fg("dim", `"${args.text}"`)}`;
			if (args.id !== undefined) text += ` ${theme.fg("accent", `#${args.id}`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as TodoDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.error) {
				return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			}

			const todoList = details.todos;

			switch (details.action) {
				case "list": {
					if (todoList.length === 0) {
						return new Text(theme.fg("dim", "No todos"), 0, 0);
					}
					let listText = theme.fg("muted", `${todoList.length} todo(s):`);
					const display = expanded ? todoList : todoList.slice(0, 5);
					for (const t of display) {
						const check = t.done ? theme.fg("success", "✓") : theme.fg("dim", "○");
						const itemText = t.done ? theme.fg("dim", t.text) : theme.fg("muted", t.text);
						listText += `\n${check} ${theme.fg("accent", `#${t.id}`)} ${itemText}`;
					}
					if (!expanded && todoList.length > 5) {
						listText += `\n${theme.fg("dim", `... ${todoList.length - 5} more`)}`;
					}
					return new Text(listText, 0, 0);
				}

				case "add": {
					const added = todoList[todoList.length - 1];
					return new Text(
						theme.fg("success", "✓ Added ") +
							theme.fg("accent", `#${added.id}`) +
							" " +
							theme.fg("muted", added.text),
						0,
						0,
					);
				}

				case "toggle": {
					const text = result.content[0];
					const msg = text?.type === "text" ? text.text : "";
					return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
				}

				case "clear":
					return new Text(theme.fg("success", "✓ ") + theme.fg("muted", "Cleared all todos"), 0, 0);
			}
		},
	});

	pi.registerCommand("todos", {
		description: "Show the temporary session todo list",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/todos requires interactive mode", "error");
				return;
			}

			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				return new TodoListComponent(todos, theme, () => done());
			});
		},
	});

	pi.registerCommand("todo-clear", {
		description: "Clear the temporary session todo list",
		handler: async (_args, ctx) => {
			const count = todos.length;
			todos = [];
			nextId = 1;
			updateWidget(ctx);
			ctx.ui.notify(`Cleared ${count} session todos`, "info");
		},
	});
}
