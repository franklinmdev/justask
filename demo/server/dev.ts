import { jevProvider } from "justask/jev";
import { createDemoHandler } from "./handler.ts";

/**
 * The handler the dev server mounts, with the real Jev provider. It reads
 * TYPESAFE_API_KEY from the server's environment, which the Vite config loads
 * from .env; nothing here reaches the browser bundle.
 */
export const handle = createDemoHandler(jevProvider(), {
	onError(error) {
		console.error(
			`justask: ${error.message}`,
			error.kind === "provider" ? error.cause : "",
		);
	},
});
