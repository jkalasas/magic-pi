import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Personal providers plugin.
 *
 * Registers all custom/personal model providers in one place:
 *
 *   - fireworks    — routes Fireworks requests through the Cloudflare AI
 *                    Gateway. Only `baseUrl` is set, so pi preserves the
 *                    existing fireworks models defined in models.json.
 *   - neuralwatt   — NeuralWatt OpenAI-compatible endpoint. The API key is
 *                    resolved from auth.json["neuralwatt"] first, with the
 *                    NEURALWATT_API_KEY environment variable as a fallback.
 *   - featherless  — Featherless (featherless.ai) OpenAI-compatible endpoint.
 *                    The API key is resolved from auth.json["featherless"]
 *                    first, with FEATHERLESS_API_KEY as a fallback.
 */
export default function (pi: ExtensionAPI) {
	// --- Fireworks via Cloudflare AI Gateway (models live in models.json) ---
	pi.registerProvider("fireworks", {
		baseUrl: "https://gateway.ai.cloudflare.com/v1/bc4c021c0b951028aab5fe08f7c48af9/fireworks/custom-fireworks/inference",
	});

	// --- NeuralWatt ---
	pi.registerProvider("neuralwatt", {
		baseUrl: "https://api.neuralwatt.com/v1",
		api: "openai-completions",
		// Resolved from auth.json["neuralwatt"] first, then this env fallback.
		apiKey: "$NEURALWATT_API_KEY",
		models: [
			{
				id: "glm-5.2",
				name: "GLM 5.2",
				input: ["text"],
				reasoning: true,
				contextWindow: 1000000,
				maxTokens: 131072,
				thinkingLevelMap: {
					minimal: null,
					low: null,
					medium: null,
					high: null,
					xhigh: "xhigh",
				},
				compat: {
					supportsDeveloperRole: false,
				},
			},
			{
				id: "kimi-k2.7-code",
				name: "Kimi K2.7 Code",
				input: ["text", "image"],
				reasoning: true,
				contextWindow: 256000,
				maxTokens: 200000,
				thinkingLevelMap: {
					minimal: null,
					low: null,
					medium: null,
					high: "high",
					xhigh: null,
				},
				compat: {
					supportsDeveloperRole: false,
				},
			},
		],
	});

	// --- Featherless ---
	pi.registerProvider("featherless", {
		baseUrl: "https://api.featherless.ai/v1",
		api: "openai-completions",
		// Resolved from auth.json["featherless"] first, then this env fallback.
		apiKey: "$FEATHERLESS_API_KEY",
		models: [
			{
				id: "zai-org/GLM-5.2",
				name: "GLM 5.2",
				input: ["text"],
				reasoning: true,
				contextWindow: 256000,
				maxTokens: 131072,
				thinkingLevelMap: {
					minimal: null,
					low: null,
					medium: null,
					high: null,
					xhigh: "xhigh",
				},
				compat: {
					supportsDeveloperRole: false,
				},
			},
		],
	});
}
