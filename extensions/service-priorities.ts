/**
 * service-priorities extension
 * ----------------------------
 * Reads getAgentDir()/service_priorities.json and uses it to choose the
 * startup model based on per-model priority "levels" (strings, not numbers).
 *
 * Config file shape:
 * {
 *   "<provider>": {
 *     "<model id>": "<priority level>"
 *   }
 * }
 *
 * Example:
 * {
 *   "anthropic": {
 *     "claude-opus-4-5": "critical",
 *     "claude-sonnet-4-5": "high"
 *   },
 *   "fireworks": {
 *     "accounts/fireworks/models/glm-5p2": "medium",
 *     "accounts/fireworks/models/deepseek-v4-pro": "low"
 *   }
 * }
 *
 * Behavior:
 * - On a FRESH startup (session_start reason "startup"), if the user did NOT
 *   pass --model / --provider on the CLI, pick the highest-priority model that
 *   is (a) listed in service_priorities.json and (b) has auth configured, then
 *   set it as the active model via pi.setModel().
 * - If the currently selected model is already that top-priority model, do nothing.
 * - If no listed model has auth, do nothing (pi's normal default is kept).
 * - Providers / models NOT in the file are never selected by this extension.
 * - No failover. No effect on resume / fork / reload / new session.
 * - The active model's priority level is shown in the footer via setStatus.
 * - /service-priority command lists the configured ranking and availability.
 * - The priority level is injected as the `service_tier` field of the outbound
 *   provider request body (only for models explicitly listed in
 *   service_priorities.json).
 *
 * Ordering of string levels:
 * Levels are ranked by their index in TIER_ORDER below (lower index = preferred).
 * A level not in TIER_ORDER sorts after all known tiers, ties broken alphabetically.
 * Different services can use different level strings; just add every level you
 * use to TIER_ORDER in your preferred order, or rely on the alphabetical fallback.
 */

import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ---- Configuration ---------------------------------------------------------

/**
 * Ordered list of priority levels, most preferred first.
 * Edit this to match the vocabulary you use in service_priorities.json.
 * Any level not listed here is treated as lower than all listed levels.
 */
const TIER_ORDER: string[] = [
  "critical",
  "high",
  "medium",
  "low",
  "avoid",
];

/** Set to true to log decisions to stderr for debugging. */
const DEBUG = process.env.PI_SERVICE_PRIORITIES_DEBUG === "1";

// ---- Helpers ---------------------------------------------------------------

type ServicePriorities = Record<string, Record<string, string>>;

function prioritiesPath(): string {
  return join(getAgentDir(), "service_priorities.json");
}

async function loadPriorities(): Promise<ServicePriorities | undefined> {
  const path = prioritiesPath();
  try {
    const content = await readFile(path, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as ServicePriorities;
  } catch (err) {
    // Missing file or unreadable: just do nothing (opt-in).
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[service-priorities] could not read ${path}:`, err);
    }
    return undefined;
  }
}

function compareLevels(a: string, b: string): number {
  const ia = TIER_ORDER.indexOf(a);
  const ib = TIER_ORDER.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1; // a known, b unknown -> a preferred
  if (ib >= 0) return 1; // b known, a unknown -> b preferred
  return a.localeCompare(b); // both unknown: alphabetical
}

interface Ranked {
  provider: string;
  modelId: string;
  level: string;
  available: boolean;
}

/** Build the ranked list of every model mentioned in the priorities file. */
function rankAll(priorities: ServicePriorities, registry: ExtensionAPI extends never ? never : any): Ranked[] {
  const all = registry.getAll() as Array<{ provider: string; id: string }>;
  const byKey = new Map(all.map((m) => [`${m.provider}\0${m.id}`, m]));

  const ranked: Ranked[] = [];
  for (const [provider, models] of Object.entries(priorities)) {
    if (!models || typeof models !== "object") continue;
    for (const [modelId, level] of Object.entries(models)) {
      if (typeof level !== "string") continue;
      const model = byKey.get(`${provider}\0${modelId}`);
      ranked.push({
        provider,
        modelId,
        level,
        available: model ? registry.hasConfiguredAuth(model) : false,
      });
    }
  }
  ranked.sort((a, b) => compareLevels(a.level, b.level));
  return ranked;
}

/** True if the CLI explicitly requested a model/provider. */
function cliRequestedModel(): boolean {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--model" || argv[i] === "--provider") return true;
    // also handle --model=... / --provider=... forms
    if (argv[i].startsWith("--model=") || argv[i].startsWith("--provider=")) return true;
  }
  return false;
}

function debug(msg: string): void {
  if (DEBUG) console.error(`[service-priorities] ${msg}`);
}

// ---- Extension -------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  let priorities: ServicePriorities | undefined;

  // Load once at startup. (Factory may run before session_start; reading async
  // here would delay startup unnecessarily, so we load lazily on first use.)
  async function ensurePriorities(): Promise<ServicePriorities | undefined> {
    if (priorities === undefined && !ensurePrioritiesLoaded) {
      priorities = await loadPriorities();
      ensurePrioritiesLoaded = true;
    }
    return priorities;
  }
  let ensurePrioritiesLoaded = false;

  function currentLevel(ctx: any): string | undefined {
    const model = ctx.model as { provider?: string; id?: string } | undefined;
    if (!model || !model.provider || !model.id) return undefined;
    return priorities?.[model.provider]?.[model.id];
  }

  function refreshStatus(ctx: any): void {
    if (!ctx.hasUI) return;
    const level = currentLevel(ctx);
    if (level) {
      ctx.ui.setStatus("service_tier", `tier: ${level}`);
    } else {
      ctx.ui.setStatus("service_tier", "");
    }
  }

  pi.on("session_start", async (event, ctx) => {
    // Only act on a fresh startup, never on reload/new/resume/fork.
    if (event.reason !== "startup") {
      // Still reflect priority of whatever model was restored.
      await ensurePriorities();
      refreshStatus(ctx);
      return;
    }

    const cfg = await ensurePriorities();
    if (!cfg) {
      debug("no service_priorities.json found; doing nothing");
      return;
    }

    // Respect explicit CLI choice.
    if (cliRequestedModel()) {
      debug("CLI --model/--provider present; doing nothing");
      refreshStatus(ctx);
      return;
    }

    const registry = ctx.modelRegistry;
    const ranked = rankAll(cfg, registry);
    const top = ranked.find((r) => r.available);
    if (!top) {
      debug("no listed model has auth configured; doing nothing");
      refreshStatus(ctx);
      return;
    }

    const current = ctx.model as { provider?: string; id?: string } | undefined;
    if (current && current.provider === top.provider && current.id === top.modelId) {
      debug(`current model already top priority (${top.provider}/${top.modelId})`);
      refreshStatus(ctx);
      return;
    }

    const model = registry.find(top.provider, top.modelId);
    if (!model) {
      debug(`top model ${top.provider}/${top.modelId} not in registry; doing nothing`);
      refreshStatus(ctx);
      return;
    }

    debug(`selecting top priority: ${top.provider}/${top.modelId} (${top.level})`);
    const ok = await pi.setModel(model);
    if (!ok) {
      debug(`pi.setModel returned false for ${top.provider}/${top.modelId}`);
    }
    refreshStatus(ctx);
  });

  // Keep footer status current when the user changes models manually.
  pi.on("model_select", async (_event, ctx) => {
    await ensurePriorities();
    refreshStatus(ctx);
  });

  // Inject the priority level as `service_tier` in the outbound request body,
  // but only for models explicitly listed in service_priorities.json.
  pi.on("before_provider_request", async (event, ctx) => {
    const cfg = await ensurePriorities();
    if (!cfg) return;

    const model = ctx.model as { provider?: string; id?: string } | undefined;
    if (!model || !model.provider || !model.id) return;

    const level = cfg[model.provider]?.[model.id];
    if (typeof level !== "string") return; // not listed -> do not touch

    const payload = event.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== "object") return;

    // Only inject if not already set explicitly by pi or another extension.
    if (payload.service_tier !== undefined) {
      debug(`service_tier already set (${String(payload.service_tier)}); not overriding`);
      return;
    }

    debug(`injecting service_tier=${level} for ${model.provider}/${model.id}`);
    return { ...payload, service_tier: level };
  });

  // /service-priority command: show the configured ranking.
  pi.registerCommand("service-priority", {
    description: "Show model ranking from service_priorities.json and switch to the top available one",
    handler: async (args, ctx) => {
      const cfg = await ensurePriorities();
      if (!cfg) {
        ctx.ui.notify(`No ${prioritiesPath()} found.`, "info");
        return;
      }

      const registry = ctx.modelRegistry;
      const ranked = rankAll(cfg, registry);

      if (ranked.length === 0) {
        ctx.ui.notify("service_priorities.json has no entries.", "info");
        return;
      }

      const lines = ranked.map(
        (r) =>
          `  [${r.level.padEnd(8)}] ${r.available ? "✓" : "✗"}  ${r.provider}/${r.modelId}`,
      );
      const msg = ["Service priorities:", ...lines].join("\n");

      // If invoked with "set", jump to the top available model.
      if (args && args.trim() === "set") {
        const top = ranked.find((r) => r.available);
        if (!top) {
          ctx.ui.notify("No listed model has auth configured.", "error");
          return;
        }
        const model = registry.find(top.provider, top.modelId);
        if (!model) {
          ctx.ui.notify(`${top.provider}/${top.modelId} not found in registry.`, "error");
          return;
        }
        const ok = await pi.setModel(model);
        ctx.ui.notify(
          ok
            ? `Switched to ${top.provider}/${top.modelId} (${top.level})`
            : `No API key for ${top.provider}/${top.modelId}`,
          ok ? "info" : "error",
        );
        return;
      }

      // Otherwise just report. Use notify with the full text.
      ctx.ui.notify(msg, "info");
    },
  });
}
