import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Featherless (featherless.ai) OpenAI-compatible endpoint. The API key is
// resolved from auth.json["featherless"] first, with FEATHERLESS_API_KEY as
// a fallback.
export function registerFeatherless(pi: ExtensionAPI) {
	pi.registerProvider("featherless", {
		baseUrl: "https://api.featherless.ai/v1",
		api: "openai-completions",
		apiKey: "$FEATHERLESS_API_KEY",
		models: [
			{
				id: "zai-org/GLM-5.2",
				name: "GLM 5.2",
				input: ["text"],
				reasoning: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
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
