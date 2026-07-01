# Modes Extension

Adds switchable agent modes to pi, similar to opencode's Plan / Build modes.

## How it works

Modes are Markdown files:

- **Bundled with the extension:** `<PI_CODING_AGENT_DIR>/extensions/modes/modes/*.md`  (shipped modes)
- **Global:** `<PI_CODING_AGENT_DIR>/modes/*.md`  (i.e. `getAgentDir()/modes`)
- **Project-local:** `<cwd>/.pi/modes/*.md`  (overrides globals and extension-bundled modes with the same name)

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
| `Ctrl+M`                | Open the mode selector (same as `/mode`).        |
| `/mode`                 | Open the mode selector.                          |
| `/mode <name>`          | Switch to a specific mode directly.              |
| `/mode pi`              | Return to default pi behavior.                   |
| `/btw`                  | Open a side-chat modal (separate ask-mode sub-session seeded with the current session). |
| `--agent-mode <name>`   | Start pi in a mode (CLI flag).                   |

> The CLI flag is `--agent-mode` (not `--mode`) because pi already uses `--mode`
> for output mode (text/json/rpc).
>
> **Ctrl+M caveat:** on legacy terminals without the Kitty keyboard protocol,
> `Ctrl+M` is indistinguishable from `Enter` and the shortcut will not fire —
> use `/mode` instead, or remap the shortcut in `keybindings.json` (e.g. to
> `ctrl+shift+m`).

The mode selector has a **type-to-filter search input** at the top. Typing
filters the list by mode-name prefix; `Backspace` edits the query, `Esc` clears
the query (or closes the selector if the query is empty), and `Up`/`Down`/`Enter`
navigate and confirm.

## `/btw` — side chat

`/btw` opens a floating overlay modal containing a separate pi sub-session
running in **ask mode**. It is a throwaway conversation you can use to ask
"by the way" questions about the work in progress without polluting the main
session's context.

What happens when you run `/btw`:

1. A compact transcript of the current session (last ~12 user/assistant text
   messages, each truncated) is written to a temp file.
2. A separate `pi --mode rpc --no-session --agent-mode ask` subprocess is
   spawned with that transcript appended to its system prompt. The sub-session
   inherits the current model and working directory.
3. An overlay modal opens with a scrollable transcript and a single-line input.

In the modal:

| Key         | Effect                                                   |
|-------------|----------------------------------------------------------|
| `Enter`     | Send the typed prompt to the sub-session.                |
| `Esc`       | Abort a streaming response; if idle, close the modal.    |
| `Up`/`Down` | Scroll the transcript (only when idle).                  |

Responses stream into the transcript live. Tool calls the sub-session makes
(read, grep, etc. — ask mode is read-only) are shown as `→ toolName` lines.
The sub-session is killed and the temp file cleaned up when the modal closes.

The sub-session is a fully isolated pi process: it has its own context window,
does not touch the main session file, and cannot block on dialogs (any
`extension_ui_request` it raises is auto-dismissed). Closing the modal ends
the side chat; running `/btw` again starts a fresh one.

## Examples

This extension ships with these modes in `extensions/modes/modes/`:

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
- **`fix-me`** — systematic root-cause debugging (the systematic-debugging
  discipline, adapted as a mode). Four phases: root-cause investigation →
  pattern analysis → hypothesis & minimal test → implementation & hardening.
  Full tool access (investigate AND fix), `thinking: high`, uses Explore
  subagents and context-mode tools for evidence gathering.
- **`review`** — code review of an existing scope (the magic-review
  discipline, adapted as a mode). Four phases: discovery → triage →
  verification → final report. Read-only (`disabled-tools: edit, write`),
  `thinking: high`. Dispatches Explore subagents for discovery and one
  general-purpose verifier subagent per triaged issue (template at
  `skills/issue-verifier-prompt.md`); reports only issues that survive
  verification.
- **`designer`** — design and ship production-grade frontend interfaces (the
  impeccable design discipline, adapted as a mode). Shape → build → inspect →
  iterate, with the AI-slop test, absolute bans, and brand/product registers.
  Full tool access (designs AND builds), `thinking: high`. Critique is an
  intent inside the mode (report-only unless asked to fix).

Add your own by dropping a `.md` file into `<cwd>/.pi/modes/` and running `/reload`, or into `<PI_CODING_AGENT_DIR>/modes/` if you want them shared across projects.

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
  btw.ts              /btw side-chat modal
  modes.README.md     this file
  modes/              mode definition files (*.md)
    ask.md
    brainstorm.md
    build.md
    designer.md
    fix-me.md
    orchestrator.md
    plan.md
    review.md
  skills/
    writing.md                      writing skill used by BRAINSTORM mode
    implementer-prompt.md           implementer subagent prompt (ORCHESTRATOR)
    spec-reviewer-prompt.md         spec compliance reviewer prompt (ORCHESTRATOR)
    code-quality-reviewer-prompt.md code quality reviewer prompt (ORCHESTRATOR)
    root-cause-tracing.md           trace bugs to origin (FIX-ME)
    defense-in-depth.md             multi-layer validation after a fix (FIX-ME)
    condition-based-waiting.md      replace arbitrary timeouts (FIX-ME)
    find-polluter.sh                bisection script for test polluters (FIX-ME)
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

## The `fix-me` mode flow

`fix-me` is the systematic-debugging discipline adapted to run as a pi mode
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

`fix-me` has full tool access (it must both investigate and fix) with
`thinking: high`. Supporting technique files live under
`extensions/modes/skills/` (`root-cause-tracing.md`, `defense-in-depth.md`,
`condition-based-waiting.md`, `find-polluter.sh`), referenced from the mode
via `{{agent_dir}}`. When the root cause + minimal fix are clear but the fix
is broad or needs a design decision, FIX-ME mode tells the user to switch to
BUILD (`/mode build`) or BRAINSTORM (`/mode brainstorm`).

## The `review` mode flow

`review` is the magic-review discipline adapted to run as a pi mode (injected
every turn while active). It reviews an EXISTING scope and reports real issues —
it does not fix them.

1. **Phase 1 — Discovery:** parse the scope (module, feature, directory,
   concept, or diff/PR). If ambiguous, pick the most likely interpretation and
   state the assumption. Find relevant files (`find`, `grep`, `git diff`/`git
   log` for PRs), read each, and identify responsibilities — including what
   depends on the code under review. Dispatch **Explore** subagents for broad
   areas. Use `ctx_execute_file` for very large files.
2. **Phase 2 — Triage:** scan all discovered files and list POTENTIAL issues
   across four categories only — **correctness, security, performance,
   architecture**. No style/nits/positive feedback. Each issue gets a category,
   `file:line`, and a claim. False positives are expected here; Phase 3 filters
   them. If nothing is found, skip to the summary.
3. **Phase 3 — Verification:** for EACH triaged issue, dispatch an independent
   **general-purpose** verifier subagent (one per issue, in parallel) using
   `extensions/modes/skills/issue-verifier-prompt.md`. Each verifier receives
   ONLY its single issue, reads the actual code, traces the call path, and
   returns CONFIRMED / REFUTED / UNDETERMINED. The controller spot-checks
   verdicts against the real code before promoting them.
4. **Phase 4 — Final Report:** aggregate and report only confirmed issues
   (with evidence + a recommended fix), refuted issues (with why), undetermined
   ones (with what's missing), and a one-paragraph summary noting any systemic
   patterns.

`review` is read-only (`disabled-tools: edit, write`, `thinking: high`). The
controller never edits; verifiers are read-only by instruction. Confirmed
issues are handed off to BUILD (surgical fix), FIX-ME (a confirmed correctness
issue that's a live bug), BRAINSTORM (an architecture finding needing design),
or ORCHESTRATOR (several independent fixes). REVIEW reviews existing code with
fresh eyes — it is not a pre-merge gate for your own in-progress work (use a
`requesting-code-review` subagent or ORCHESTRATOR's built-in review for that).

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

## The `designer` mode flow

`designer` is the impeccable frontend-design discipline adapted to run as a pi
mode (injected every turn while active). It designs AND implements
production-grade frontend interfaces — not prototypes — and self-critiques
against an AI-slop test. It is the design equivalent of `build`: full tool
access, `thinking: high`.

1. **Read the room** — read the existing build pipeline, design system, tokens,
   icon set, and brand assets before designing. Use what's there; never invent a
   parallel system. Identify the register (brand vs product). Use
   `ctx_execute_file` for large CSS/token files.
2. **Shape before you build** — ask clarifying questions one at a time
   (register, audience/context, visual direction + anti-references). Compact
   shape for clear briefs. Stop and wait for confirmation before coding.
3. **Build to the bar** — real content, semantic HTML, deliberate spacing,
   intentional type, full state coverage, premium motion, responsive, respect
   the build pipeline. Detailed craft rules (color, typography, layout, motion,
   interaction) live in `extensions/modes/skills/design-craft.md`.
4. **Inspect and iterate** — use `describe_image` / browser automation /
   screenshots to look at what you built; read screenshots back into context;
   self-critique against the brief and the slop test; patch real defects. A
   screenshot you didn't read doesn't count.
5. **The AI slop test** — two-altitude category-reflex check: first-order
   (guessable from category alone) and second-order (guessable from
   category + anti-references). Rework until neither answer is obvious.
6. **Absolute bans** — side-stripe borders, gradient text, glassmorphism as
   default, hero-metric template, identical card grids, uppercase tracked
   eyebrows on every section, numbered section markers as scaffolding, text
   overflow. Match-and-refuse; rewrite the element.

**Critique intent:** when the user asks to review (not build), `designer`
switches to report-only — slop test, Nielsen heuristic quick-scan, cognitive-load
checklist, 2–3 persona walkthroughs, and P0–P3 priority issues. The scoring
tables and persona profiles are in `design-craft.md`. It does not fix unless
asked.

`designer` hands off to BUILD (pure mechanical implementation), BRAINSTORM (a
large design decision needing a persisted spec → plan), or FIX-ME (a design
change that introduced a concrete bug). REVIEW hands design issues it surfaces
to DESIGNER.

## Files

- `extensions/modes/index.ts` — the extension
- `extensions/modes/btw.ts` — `/btw` side-chat modal (RPC sub-session client + overlay UI)
- `extensions/modes/modes/` — mode definition files (`*.md`):
  - `plan.md`, `brainstorm.md`, `build.md`,
    `orchestrator.md`, `ask.md`, `fix-me.md`, `review.md`,
    `designer.md`
- `extensions/modes/skills/writing.md` — writing skill used by `brainstorm` mode
- `extensions/modes/skills/root-cause-tracing.md`, `defense-in-depth.md`,
  `condition-based-waiting.md`, `find-polluter.sh` — debugging techniques used
  by `fix-me` mode
- `extensions/modes/skills/issue-verifier-prompt.md` — Phase 3 verification
  subagent prompt template used by `review` mode
- `extensions/modes/skills/design-craft.md` — detailed craft
  reference (color, typography, layout, motion, interaction, critique framework)
  used by `designer` mode
