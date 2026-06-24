import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Routes Fireworks requests through the Cloudflare AI Gateway via the
// custom-inference route. The API key is resolved from auth.json["inference"]
// first, with the INFERENCE_API_KEY environment variable as a fallback.
export function registerInference(pi: ExtensionAPI) {
	pi.registerProvider("inference", {
		baseUrl: "https://gateway.ai.cloudflare.com/v1/bc4c021c0b951028aab5fe08f7c48af9/fireworks/custom-inference/v1",
		api: "openai-completions",
		apiKey: "$INFERENCE_API_KEY",
		models: [
			{
				id: "GLM-5.2",
				name: "GLM-5.2",
				input: ["text"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 131072,
				thinkingLevelMap: {
					minimal: null,
					low: null,
					medium: null,
					high: null,
					xhigh: "max",
				},
				compat: {
					supportsDeveloperRole: false,
				},
			},
			{
				id: "Kimi K2.6",
				name: "Kimi K2.6",
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
			{
				id: "Kimi K2.7 Code",
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
			{
				id: "Qwen3.7 Plus",
				name: "Qwen 3.7 Plus",
				input: ["text", "image"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 65500,
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
				id: "DeepSeek-V4-Pro",
				name: "DeepSeek-V4-Pro",
				input: ["text"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 384000,
				thinkingLevelMap: {
					minimal: null,
					low: null,
					medium: null,
					high: null,
					xhigh: "max",
				},
				compat: {
					supportsDeveloperRole: false,
				},
			},
			{
				id: "DeepSeek-V4-Flash",
				name: "DeepSeek-V4-Flash",
				input: ["text"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 384000,
				thinkingLevelMap: {
					minimal: null,
					low: null,
					medium: null,
					high: null,
					xhigh: "max",
				},
				compat: {
					supportsDeveloperRole: false,
				},
			},
		],
	});
}
