import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerFireworks } from "./fireworks.ts";
import { registerInference } from "./inference.ts";
import { registerNeuralwatt } from "./neuralwatt.ts";
import { registerFeatherless } from "./featherless.ts";

// Personal providers extension.
//
// Registers all custom/personal model providers, each in its own module:
//   - fireworks    — Fireworks via Cloudflare AI Gateway (models in models.json)
//   - inference    — Fireworks via Cloudflare AI Gateway, custom-inference route
//   - neuralwatt   — NeuralWatt OpenAI-compatible endpoint
//   - featherless  — Featherless OpenAI-compatible endpoint
export default function (pi: ExtensionAPI) {
	registerFireworks(pi);
	registerInference(pi);
	registerNeuralwatt(pi);
	registerFeatherless(pi);
}
