import { buffer } from "node:stream/consumers";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import {
	defaultClientConditions,
	defaultServerConditions,
	defineConfig,
	isRunnableDevEnvironment,
	type Plugin,
} from "vite";
import { loadKeyEnv } from "../scripts/load-env.ts";

// The key lives in the repo's .env, or the main checkout's from a worktree,
// read here on the server side. Vite hands the browser only VITE_-prefixed
// variables, so it never reaches the bundle.
loadKeyEnv(fileURLToPath(new URL("..", import.meta.url)));

/**
 * Mounts the demo's search handler as dev middleware under /api. The handler
 * module runs in Vite's server environment, so it resolves `justask` from
 * src/ like the tests do, and reloads when its files change.
 */
function justaskHandler(): Plugin {
	return {
		name: "justask-handler",
		configureServer(server) {
			if (!process.env.TYPESAFE_API_KEY) {
				server.config.logger.warn(
					"justask: TYPESAFE_API_KEY is not set. Copy .env.example to .env in the main checkout and add your key; until then every search fails and is held.",
				);
			}
			server.middlewares.use("/api", async (req, res, next) => {
				try {
					const ssr = server.environments.ssr;
					if (!isRunnableDevEnvironment(ssr)) {
						throw new Error("The ssr environment cannot run modules");
					}
					const { handle } =
						await ssr.runner.import<typeof import("./server/dev.ts")>(
							"/server/dev.ts",
						);
					const response = await handle(
						new Request(`http://${req.headers.host}${req.originalUrl}`, {
							method: req.method ?? "GET",
							headers: req.headers as Record<string, string>,
							body: req.method === "POST" ? await buffer(req) : null,
						}),
					);
					res.writeHead(response.status, Object.fromEntries(response.headers));
					res.end(Buffer.from(await response.arrayBuffer()));
				} catch (error) {
					next(error);
				}
			});
		},
	};
}

export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	plugins: [react(), justaskHandler()],
	// `source` points justask's entry points at src/, as in the tests.
	resolve: { conditions: ["source", ...defaultClientConditions] },
	ssr: {
		noExternal: ["justask"],
		resolve: { conditions: ["source", ...defaultServerConditions] },
	},
});
