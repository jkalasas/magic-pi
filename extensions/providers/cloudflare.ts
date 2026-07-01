import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// NeuralWatt models routed through the Cloudflare AI Gateway. The API key is
// resolved from auth.json["cloudflare"] first, with the CLOUDFLARE_API_KEY
// environment variable as a fallback.
export function registerCloudflare(pi: ExtensionAPI) {
	pi.registerProvider("cloudflare", {
		baseUrl:
			"https://gateway.ai.cloudflare.com/v1/bc4c021c0b951028aab5fe08f7c48af9/fireworks/custom-neuralwatt/v1",
		api: "openai-completions",
		apiKey: "$CLOUDFLARE_API_KEY",
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
			{
				id: "deepseek-v4-pro",
				name: "DeepSeek V4 Pro",
				baseUrl:
					"https://gateway.ai.cloudflare.com/v1/bc4c021c0b951028aab5fe08f7c48af9/fireworks/custom-oc/zen/go/v1",
				input: ["text"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 384000,
				thinkingLevelMap: {
					minimal: null,
					low: null,
					medium: null,
					high: "high",
					xhigh: "max",
				}
			},
			{
				id: "deepseek-v4-flash",
				name: "DeepSeek V4 Flash",
				baseUrl:
					"https://gateway.ai.cloudflare.com/v1/bc4c021c0b951028aab5fe08f7c48af9/fireworks/custom-oc/zen/go/v1",
				input: ["text"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 384000,
				thinkingLevelMap: {
					minimal: null,
					low: null,
					medium: null,
					high: "high",
					xhigh: "max",
				}
			},
			{
				id: "mimo-v2.5-pro",
				name: "MiMo V2.5 Pro",
				baseUrl:
					"https://gateway.ai.cloudflare.com/v1/bc4c021c0b951028aab5fe08f7c48af9/fireworks/custom-oc/zen/go/v1",
				input: ["text", "image"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1048576,
				maxTokens: 128000
			},
			{
				id: "mimo-v2.5",
				name: "MiMo V2.5",
				baseUrl:
					"https://gateway.ai.cloudflare.com/v1/bc4c021c0b951028aab5fe08f7c48af9/fireworks/custom-oc/zen/go/v1",
				input: ["text", "image"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 128000			
			},
			{
				id: "deepseek-v4-flash-free",
				name: "DeepSeek V4 Flash Free",
				baseUrl:
					"https://gateway.ai.cloudflare.com/v1/bc4c021c0b951028aab5fe08f7c48af9/fireworks/custom-oc/zen/v1",
				input: ["text"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 200000,
				maxTokens: 128000,
				thinkingLevelMap: {
					minimal: null,
					low: null,
					medium: null,
					high: "high",
					xhigh: null,
				}
			},
			{
				id: "mimo-v2.5-free",
				name: "MiMo V2.5 Free",
				baseUrl:
					"https://gateway.ai.cloudflare.com/v1/bc4c021c0b951028aab5fe08f7c48af9/fireworks/custom-oc/zen/v1",
				input: ["text", "image"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 200000,
				maxTokens: 131072,
				thinkingLevelMap: {
					minimal: null,
					low: null,
					medium: null,
					high: "high",
					xhigh: null,
				}
			},
		],
	});
}
