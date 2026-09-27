import { Readable } from "node:stream";
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
loadKeyEnv();

/**
 * Mounts the demo's search handler as dev middleware under /api. The handler
 * module runs in Vite's server environment, so it resolves `justask` from
 * src/ like the tests do, and reloads when its files change.
 */
function justaskHandler(): Plugin {
	return {
		name: "justask-handler",
		configureServer(server) {
			const devModule = () => {
				const ssr = server.environments.ssr;
				if (!isRunnableDevEnvironment(ssr)) {
					throw new Error("The ssr environment cannot run modules");
				}
				return ssr.runner.import<typeof import("./server/dev.ts")>(
					"/server/dev.ts",
				);
			};
			if (process.env.TYPESAFE_API_KEY) {
				// One discarded call once the server listens, so a visitor's first request is not the cold start.
				server.httpServer?.once("listening", async () => {
					try {
						const { level, message } = await (await devModule()).warmStart();
						server.config.logger[level](message);
					} catch (error) {
						server.config.logger.warn(`justask: warm-up failed: ${error}`);
					}
				});
			} else {
				server.config.logger.warn(
					"justask: TYPESAFE_API_KEY is not set. Copy .env.example to .env in the main checkout and add your key; until then every search fails and is held.",
				);
			}
			server.middlewares.use("/api", async (req, res, next) => {
				try {
					const { handle } = await devModule();
					// Aborts the provider call when the browser goes away, as the README's toNode does.
					const browser = new AbortController();
					res.on("close", () => browser.abort());
					const response = await handle(
						new Request(`http://${req.headers.host}${req.originalUrl}`, {
							method: req.method ?? "GET",
							headers: {
								...(req.headers as Record<string, string>),
								// Who the visitor's limits count, as Cloudflare names them on the Worker (#110).
								"cf-connecting-ip": req.socket.remoteAddress ?? "",
							},
							// Streamed, so the handler stops reading a body past its 16 KiB cap.
							body:
								req.method === "POST"
									? (Readable.toWeb(req) as ReadableStream)
									: null,
							signal: browser.signal,
							// A streamed body needs it; the DOM's own types do not know it yet.
							duplex: "half",
						} as RequestInit),
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
	// `justask-source` points justask's entry points at src/, as in the tests.
	resolve: { conditions: ["justask-source", ...defaultClientConditions] },
	ssr: {
		noExternal: ["justask"],
		resolve: { conditions: ["justask-source", ...defaultServerConditions] },
	},
});
