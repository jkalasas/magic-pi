# Modes Extension

Adds switchable agent modes to pi, similar to opencode's Plan / Build modes.

## How it works

Modes are Markdown files in a `modes/` directory:

- **Global:** `<PI_CODING_AGENT_DIR>/modes/*.md`  (i.e. `getAgentDir()/modes`)
- **Project-local:** `<cwd>/.pi/modes/*.md`  (overrides globals with the same name)

The filename (without `.md`) is the mode name. There is always a built-in **`pi`**
mode that is the default pi behavior — it loads nothing and injects no extra
system prompt.

## Mode file format

```markdown
---
description: Collaborative brainstorm → spec → implementation plan
tools: read, bash, grep, find, ls, write
thinking: high
---

You are in BRAINSTORM mode. Your job is to turn a vague idea into a validated
design...
```

The YAML-ish frontmatter is **optional**. Supported fields:

| Field             | Type   | Meaning                                                                 |
|-------------------|--------|-------------------------------------------------------------------------|
| `description`     | string | Short label shown in the mode selector and footer.                      |
| `tools`           | list   | Comma-separated tool names to activate (**whitelist**; replaces set).   |
| `disabled-tools`  | list   | Comma-separated tool names to disable (**blocklist**; subtracted after `tools`). |
| `thinking`        | enum   | `off` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh`.              |
| `model`           | string | Model to switch to, as `<provider>/<model>` (e.g. `anthropic/claude-sonnet-4-5`). |

### `tools` vs `disabled-tools`

Two ways to control the tool set:

- **`tools:` (whitelist)** — replaces the active set with the listed names.
  Use when a mode wants a *tight, known* set. Maintenance cost: every new
  built-in, extension, or MCP tool must be added to the list or it is
  silently dropped.
- **`disabled-tools:` (blocklist)** — removes the listed names from the
  current set, leaving everything else available. **Preferred for read-only
  modes** (`plan`, `ask`, `orchestrator`): `disabled-tools: edit, write`
  expresses the actual intent and is future-proof against new tools.

If **both** are given, the whitelist is applied first and the blocklist is
subtracted from it. If **neither** is given, the active tool set is left
untouched — use this for "full access" modes (e.g. `build`).

> `bash` can still mutate files (`sed -i`, `echo >`, `rm`) regardless of any
> tool list. The read-only guarantee comes from the mode's system-prompt
> instructions; the tool list is a belt-and-suspenders guard that simply
> withholds `edit`/`write`.

The body (after the frontmatter) is injected into the system prompt as
additional instructions for every turn while the mode is active. The `pi` mode
injects nothing.

## Usage

| Action                  | Effect                                           |
|-------------------------|--------------------------------------------------|
| `Tab` (empty editor)    | Cycle to the next mode. Autocomplete still works when the editor has text or a dropdown is open. |
| `/mode`                 | Open the mode selector.                          |
| `/mode <name>`          | Switch to a specific mode directly.              |
| `/mode pi`              | Return to default pi behavior.                   |
| `--agent-mode <name>`   | Start pi in a mode (CLI flag).                   |

> The CLI flag is `--agent-mode` (not `--mode`) because pi already uses `--mode`
> for output mode (text/json/rpc).

## Examples

This extension ships with these modes in `modes/`:

- **`plan`** — read-only planning (opencode-style). Analyze the codebase
  directly and via Explore subagents, ask clarifying questions, then present a
  reviewed plan in the conversation. No edits, no files written.
- **`brainstorm`** — collaborative design → spec → plan flow. Produces
  persisted spec and plan documents under `pi-magics/` with review gates.
- **`build`** — focused implementation with full tool access.
- **`orchestrator`** — execute a plan task-by-task via subagents with a
  two-stage review (spec compliance → code quality) after each task.
  Subagent-driven-development discipline, adapted to pi's `pi-magics/` plan
  store.
- **`ask`** — answer questions and explain code without making changes.
- **`debug`** — systematic root-cause debugging (the systematic-debugging
  discipline, adapted as a mode). Four phases: root-cause investigation →
  pattern analysis → hypothesis & minimal test → implementation & hardening.
  Full tool access (investigate AND fix), `thinking: high`, uses Explore
  subagents and context-mode tools for evidence gathering.

Add your own by dropping a `.md` file into `modes/` and running `/reload`.

## What each mode does when activated

1. **Model** — if `model:` is specified as `<provider>/<model>`, pi switches to
   that model. When you switch back to `pi`, your original model is restored.
2. **Tools** — if `tools:` is specified it replaces the active set; if
   `disabled-tools:` is specified those names are removed. If neither is
   given the active set is untouched. When you switch back to `pi`, your
   original active tools are restored.
3. **Thinking level** — if `thinking:` is specified, it is applied. Restored on
   switch back to `pi`.
4. **System prompt** — the mode body is appended to the system prompt each turn.
5. **Footer status** — the active mode is shown in the footer as `◐ <name>`.
6. **Persistence** — the active mode is saved to the session and restored on
   `/resume`, `/fork`, or restart. The `--agent-mode` flag overrides persisted
   state.

## Folder layout

The extension lives in a folder so it can bundle its own supporting skills:

```
extensions/modes/
  index.ts            the extension (folder entry point)
  skills/
    writing.md                      writing skill used by BRAINSTORM mode
    implementer-prompt.md           implementer subagent prompt (ORCHESTRATOR)
    spec-reviewer-prompt.md         spec compliance reviewer prompt (ORCHESTRATOR)
    code-quality-reviewer-prompt.md code quality reviewer prompt (ORCHESTRATOR)
    root-cause-tracing.md           trace bugs to origin (DEBUG)
    defense-in-depth.md             multi-layer validation after a fix (DEBUG)
    condition-based-waiting.md      replace arbitrary timeouts (DEBUG)
    find-polluter.sh                bisection script for test polluters (DEBUG)
```

Mode files can reference agent-dir-relative paths with the `{{agent_dir}}`
token, which the extension replaces with `getAgentDir()` at injection time. This
is how `brainstorm` mode points at its writing skill
(`{{agent_dir}}/extensions/modes/skills/writing.md`) and at the spec/plan store
(`{{agent_dir}}/pi-magics/specs/`, `{{agent_dir}}/pi-magics/plans/`), and how
`orchestrator` mode points at its three subagent prompt templates.

## `plan` vs `brainstorm`

Both are planning modes, but they differ in where the plan lives:

|              | `plan` (opencode-style)              | `brainstorm` (superpowers-style)                |
|--------------|--------------------------------------|-------------------------------------------------|
| Artifacts    | Plan presented in conversation only  | Spec + plan files written to `pi-magics/`       |
| Research     | Direct + Explore subagents           | Direct exploration                              |
| Flow         | Analyze → plan → review              | Design → spec → self-review → user review → plan → review |

## The `orchestrator` mode flow

`orchestrator` executes an implementation plan (typically produced by
`brainstorm` and saved at `pi-magics/plans/<uuid>.md`) using the
subagent-driven-development discipline:

1. Read the plan once, extract all tasks with full text, note context, create a
   todo list.
2. Per task:
   1. Capture `BASE_SHA` (`git rev-parse HEAD`).
   2. Dispatch an **implementer subagent**
      (`skills/implementer-prompt.md`) with the full task text pasted in. Pick
      the model by task complexity (cheap for mechanical 1-2 file tasks,
      standard for multi-file integration, most capable for design judgment).
   3. Handle the implementer's status (DONE / DONE_WITH_CONCERNS /
      NEEDS_CONTEXT / BLOCKED).
   4. Dispatch a **spec compliance reviewer**
      (`skills/spec-reviewer-prompt.md`). Loop with the implementer until ✅.
   5. Dispatch a **code quality reviewer**
      (`skills/code-quality-reviewer-prompt.md`) with `BASE_SHA..HEAD_SHA`.
      Loop until Approved.
   6. Mark the task complete.
3. After all tasks, dispatch a final code reviewer for the whole commit range,
   then tell the user how to finish the branch.

`orchestrator` is read-only for the controller (`disabled-tools: edit, write`):
it delegates and verifies, it does not implement. Subagents do the writes and
commits. Tasks run **sequentially** (never dispatch multiple implementer
subagents in parallel — they share the working tree). Execution is continuous —
do not pause between tasks unless BLOCKED or all tasks are done.

If the work is a single focused change or not decomposable into independent
tasks, `orchestrator` tells the user to switch to `build` mode instead.

## The `debug` mode flow

`debug` is the systematic-debugging discipline adapted to run as a pi mode
(injected every turn while active). It governs the bug-fixing process:

1. **Phase 1 — Root cause investigation** (read-only): read errors fully,
   reproduce consistently, check recent changes (`git log`, `git diff`,
   `git bisect`), gather evidence at every component boundary, and trace bad
   values backward through the call stack to their origin. Uses Explore
   subagents for parallel investigation and context-mode tools
   (`ctx_execute_file`, `ctx_batch_execute`) to analyze logs/test output
   without flooding context. No fixes proposed yet.
2. **Phase 2 — Pattern analysis**: find similar working code in the codebase,
   compare, list every difference, understand dependencies.
3. **Phase 3 — Hypothesis & testing**: form a single specific hypothesis, test
   it with the smallest possible change, one variable at a time.
4. **Phase 4 — Implementation**: write a failing repro test first, then a
   single fix at the root cause, then verify. If 3+ fixes fail, STOP and
   question the architecture. After the fix, harden with defense-in-depth and
   a regression test; if the bug was timing/flakiness, switch to
   condition-based waiting.

The Iron Law: **no fixes without root-cause investigation first.**

`debug` has full tool access (it must both investigate and fix) with
`thinking: high`. Supporting technique files live under
`extensions/modes/skills/` (`root-cause-tracing.md`, `defense-in-depth.md`,
`condition-based-waiting.md`, `find-polluter.sh`), referenced from the mode
via `{{agent_dir}}`. When the root cause + minimal fix are clear but the fix
is broad or needs a design decision, DEBUG mode tells the user to switch to
BUILD (`/mode build`) or BRAINSTORM (`/mode brainstorm`).

## The `brainstorm` mode flow

`brainstorm` is a design → spec → plan mode (adapted from the superpowers
brainstorming + writing-plans discipline, no visual companion):

1. Explore project context.
2. Ask clarifying questions one at a time.
3. Propose 2-3 approaches, then present the design in sections for approval.
4. On approval, write a spec to `pi-magics/specs/<uuid>.md` (UUID via `uuidgen`).
5. Self-review the spec, then have the user review it.
6. Read `extensions/modes/skills/writing.md` and write the implementation plan
   to `pi-magics/plans/<uuid>.md` (same UUID as the spec).
7. Self-review (optionally dispatch a plan-reviewer subagent), then have the
   user review the plan.
8. Tell the user to switch to `build` (or `orchestrator`) mode to implement.

The brainstorm mode has `write` and `edit` for creating and revising spec/plan
files under `pi-magics/`. The codebase itself stays read-only by instruction
(the mode prompt forbids editing source files); `bash` can still mutate, so as
with the other modes the read-only guarantee on the codebase is prompt-enforced.

## Files

- `extensions/modes/index.ts` — the extension
- `extensions/modes/skills/writing.md` — writing skill used by `brainstorm` mode
- `extensions/modes/skills/root-cause-tracing.md`, `defense-in-depth.md`,
  `condition-based-waiting.md`, `find-polluter.sh` — debugging techniques used
  by `debug` mode
- `modes/plan.md`, `modes/brainstorm.md`, `modes/build.md`,
  `modes/orchestrator.md`, `modes/ask.md`, `modes/debug.md` — modes
