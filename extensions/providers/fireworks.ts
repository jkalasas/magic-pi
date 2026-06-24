import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Routes Fireworks requests through the Cloudflare AI Gateway. Only `baseUrl`
// is set, so pi preserves the existing fireworks models defined in models.json.
export function registerFireworks(pi: ExtensionAPI) {
	pi.registerProvider("fireworks", {
		baseUrl: "https://gateway.ai.cloudflare.com/v1/bc4c021c0b951028aab5fe08f7c48af9/fireworks/custom-fireworks/inference",
	});
}
