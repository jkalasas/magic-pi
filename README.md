# magic-pi

A personal, shareable [pi](https://github.com/earendil-works/pi-coding-agent) agent configuration. This directory is a self-contained pi "agent config" (the kind you point pi at with `--agent-dir` or drop in as `<PI_CODING_AGENT_DIR>`): it holds settings, model definitions, custom extensions, and a set of switchable agent **modes**.

The tree is designed to be safe to put in git and share publicly — secrets, caches, session data, and local trust state are all gitignored (see `.gitignore`).

## Layout

```
magic-pi/
├── settings.json              # pi core settings (default provider/model, theme, packages)
├── models.json                # custom model definitions (Fireworks models)
├── keybindings.json           # TUI keybindings
├── vision-settings.json       # fallback vision model for auxiliary-vision
├── web-fetch.json             # provider/model for web fetch fallback
├── service_priorities.json    # startup model priority ranking
├── trust.json                 # (gitignored) trusted filesystem paths
├── auth.json                  # (gitignored) provider API keys
├── mcp-cache.json             # (gitignored) regenerated MCP cache
├── mcp-npx-cache.json         # (gitignored) regenerated npx MCP cache
├── mcp-onboarding.json        # (gitignored) MCP onboarding state
├── run-history.jsonl          # (gitignored) run history
├── sessions/                  # (gitignored) session transcripts
│
├── extensions/                # TypeScript extensions loaded by pi
│   ├── providers/             # custom model providers (one file per provider)
│   │   ├── index.ts           #   entry: registers fireworks/inference/neuralwatt/featherless
│   │   ├── fireworks.ts       #   Fireworks via Cloudflare AI Gateway (models in models.json)
│   │   ├── inference.ts       #   Fireworks via Cloudflare AI Gateway, custom-inference route
│   │   ├── neuralwatt.ts      #   NeuralWatt OpenAI-compatible endpoint
│   │   └── featherless.ts     #   Featherless OpenAI-compatible endpoint
│   ├── service-priorities.ts  # startup model selection by priority tier
│   ├── magic-todo.ts          # session-persisted todo tool + /todos command (tree-aware)
│   ├── auxiliary-vision/      # describe_image tool for non-vision models
│   └── modes/                 # the modes extension + its bundled skills
│       ├── index.ts
│       ├── modes.README.md    # detailed modes documentation
│       └── skills/            # prompts/templates used by the modes
│
├── modes/                     # Markdown mode definitions (plan/build/ask/...)
├── prompts/                   # (empty) custom prompt templates
├── pi-magics/                 # (gitignored) spec/plan artifacts from brainstorm mode
│   ├── specs/
│   └── plans/
└── npm/                       # extension dependencies (installed via bun)
    ├── package.json
    └── node_modules/          # (gitignored)
```

## Core settings (`settings.json`)

| Key                    | Value                                   | Notes                                            |
|------------------------|-----------------------------------------|--------------------------------------------------|
| `defaultProvider`      | `fireworks`                             | overridden at startup by service-priorities ext  |
| `defaultModel`         | `accounts/fireworks/models/glm-5p2`     | GLM 5.2 via Fireworks                            |
| `defaultThinkingLevel` | `xhigh`                                 | extended thinking by default                     |
| `theme`                | `pompom`                                |                                                  |
| `npmCommand`           | `["bun"]`                               | extensions installed with bun                    |
| `packages`             | 6 pi packages (see below)               | loaded from `npm/`                               |

### Installed packages (`npm/package.json`)

- `@tintinweb/pi-subagents` — subagent orchestration primitives
- `pi-mcp-adapter` — MCP server adapter
- `pi-web-access` — web search / fetch tools + skills
- `pi-rewind` — session rewind
- `pi-token-speed` — token streaming/perf tooling
- `context-mode` — context-window preserving tools (`ctx_execute`, `ctx_search`, ...)

## Model providers (`extensions/providers/` + `models.json`)

Each provider lives in its own file under `extensions/providers/`, and `index.ts` registers them all:

- **Fireworks** (`fireworks.ts`) — routed through a Cloudflare AI Gateway (`baseUrl` only; model catalog lives in `models.json`). Models: GLM 5.2, Deepseek V4 Pro, GLM 5.1 (fast router), Deepseek V4 Flash, Kimi K2.7 Code.
- **Inference** (`inference.ts`) — Fireworks via the Cloudflare AI Gateway's custom-inference route. API key from `auth.json["inference"]` or `INFERENCE_API_KEY`. Models: GLM-5.2, Kimi K2.6, Kimi K2.7 Code, Qwen 3.7 Plus, DeepSeek-V4-Pro, DeepSeek-V4-Flash.
- **NeuralWatt** (`neuralwatt.ts`) — OpenAI-compatible endpoint (`api.neuralwatt.com`). API key from `auth.json["neuralwatt"]` or `NEURALWATT_API_KEY`. Models: GLM 5.2, Kimi K2.7 Code.
- **Featherless** (`featherless.ts`) — OpenAI-compatible endpoint (`api.featherless.ai`). API key from `auth.json["featherless"]` or `FEATHERLESS_API_KEY`. Model: GLM 5.2.

### Startup model selection (`service-priorities.ts`)

On a **fresh startup** (no `--model`/`--provider` passed), the service-priorities extension reads `service_priorities.json` and picks the highest-priority model that has auth configured, then sets it via `pi.setModel()`. The selected model's tier is shown in the footer and injected as the `service_tier` field on outbound requests. No effect on resume/fork/reload. Use `/service-priority` to list the ranking.

Current ranking (`service_priorities.json`):

```json
{ "fireworks": { "accounts/fireworks/models/glm-5p2": "priority" } }
```

## Extensions

### `auxiliary-vision/`
Adds a `describe_image` tool that delegates to a vision-capable model when the active model can't process images. The tool auto-shows/hides on model switch based on whether the active model declares `image` input. Configured via `vision-settings.json` (currently `opencode-go/mimo-v2.5`). Supported formats: PNG, JPG, JPEG, GIF, WebP, BMP, SVG, TIFF.

### `magic-todo.ts`
A session-scoped todo list whose state is persisted in tool-result details (in the session file). Exposes a `todo` tool for the LLM (actions: list, add, toggle, delete, clear) and a `/todos` slash command for the user. State is reconstructed from the current branch on load, reload, resume, fork, and `/tree` navigation, so going back to an earlier point in the conversation tree reverts the todos to that point. `/new` starts empty.

### `modes/`
The flagship extension: switchable agent modes (opencode-style Plan/Build, plus more). See `extensions/modes/modes.README.md` for the full spec. Ships with these modes in `modes/`:

| Mode          | Purpose                                                        | Access      |
|---------------|----------------------------------------------------------------|-------------|
| `pi`          | default pi behavior (no injection)                             | full        |
| `plan`        | read-only planning, present plan in conversation               | read-only   |
| `brainstorm`  | design → spec → plan flow, writes to `pi-magics/`              | spec/plan writable |
| `build`       | focused implementation                                         | full        |
| `orchestrator`| execute a plan task-by-task via subagents w/ two-stage review  | read-only (delegates) |
| `ask`         | answer questions / explain code without changes                | read-only   |
| `debug`       | systematic root-cause debugging (4 phases)                     | full        |
| `review`      | review existing scope, verify issues via subagents             | read-only   |

Usage: `Tab` (empty editor) cycles modes · `/mode` opens the selector · `/mode <name>` switches directly · `/mode pi` returns to default · `--agent-mode <name>` starts pi in a mode.

## Keybindings (`keybindings.json`)

| Binding                  | Action        |
|--------------------------|---------------|
| `tui.input.newLine`      | `ctrl+j`      |

## Getting started

1. **Install dependencies** for the extensions:
   ```bash
   cd npm && bun install
   ```
2. **Add API keys** to `auth.json` (gitignored — copy the shape, not the file, from another machine). Keys consumed: `fireworks`, `neuralwatt`, `featherless` (plus whatever your installed MCP servers need).
3. **Point pi at this config** by setting the `PI_CODING_AGENT_DIR` environment variable to this directory (pi's default is `~/.pi/agent`):
   ```bash
   export PI_CODING_AGENT_DIR=/path/to/magic-pi
   pi
   ```
4. **(Optional) trust directories** via `/trust` so pi can edit them — recorded in `trust.json` (gitignored).

## What's shared vs. private

## What's shared vs. private

Kept in git (shareable): `settings.json`, `models.json`, `keybindings.json`, `extensions/`, `modes/`, `npm/package.json`, `*.json` config like `vision-settings.json`, `web-fetch.json`, `service_priorities.json`.

Gitignored (private / machine-local): `auth.json`, `trust.json`, `sessions/`, `run-history.jsonl`, `mcp-cache.json`, `mcp-npx-cache.json`, `mcp-onboarding.json`, `mcp-oauth/`, `pi-magics/`, `npm/node_modules/`.

## Further reading

- Modes deep-dive: [`extensions/modes/modes.README.md`](extensions/modes/modes.README.md)
- pi core docs: `pi` package README and `docs/`
