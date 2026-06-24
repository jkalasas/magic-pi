import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// NeuralWatt OpenAI-compatible endpoint. The API key is resolved from
// auth.json["neuralwatt"] first, with the NEURALWATT_API_KEY environment
// variable as a fallback.
export function registerNeuralwatt(pi: ExtensionAPI) {
	pi.registerProvider("neuralwatt", {
		baseUrl: "https://api.neuralwatt.com/v1",
		api: "openai-completions",
		apiKey: "$NEURALWATT_API_KEY",
		models: [
			{
				id: "glm-5.2",
				name: "GLM 5.2",
				input: ["text"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 131072,
				thinkingLevelMap: {
					minimal: null,
					low: null,
					medium: null,
					high: "high",
					xhigh: "max",
				},
				compat: {
					supportsDeveloperRole: false,
				},
			},
			{
				id: "glm-5.2-short",
				name: "GLM 5.2 Short",
				input: ["text"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 200000,
				maxTokens: 131072,
				thinkingLevelMap: {
					minimal: null,
					low: null,
					medium: "medium",
					high: "high",
					xhigh: null,
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
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
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
}
