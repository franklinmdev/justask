import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
	createServer,
	type IncomingMessage,
	request,
	type Server,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSearchHandler } from "@justask/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeProvider, hangingProvider } from "./fake-provider.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The README's `toNode`, as a person copies it: the code block that declares it. */
const snippet = (() => {
	const readme = readFileSync(join(root, "README.md"), "utf8");
	const block = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)]
		.map(([, code]) => code ?? "")
		.find((code) => code.includes("export function toNode"));
	if (!block) throw new Error("README.md has no toNode block");
	return block;
})();

type ToNode = (
	handler: (request: Request) => Promise<Response>,
) => (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const temp = mkdtempSync(join(tmpdir(), "justask-readme-node-"));
let toNode: ToNode;
const search = {
	description: "the vendor the request means",
	gate: 0.5,
	shortlist: () => [{ id: "acme", description: "Acme", value: 1 }],
};
const provider = hangingProvider();
const servers: Server[] = [];

beforeAll(async () => {
	const path = join(temp, "to-node.ts");
	writeFileSync(path, snippet);
	({ toNode } = (await import(pathToFileURL(path).href)) as {
		toNode: ToNode;
	});
});

afterAll(() => {
	for (const server of servers) server.close();
	rmSync(temp, { recursive: true, force: true });
});

/** The README's Node server around a handler, on a free port. */
async function serve(
	handler: (request: Request) => Promise<Response>,
): Promise<number> {
	const mount = toNode(handler);
	const server = createServer((req, res) => {
		mount(req, res).catch(() => {
			res.statusCode = 500;
			res.end();
		});
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, resolve));
	return (server.address() as AddressInfo).port;
}

/** One raw POST, so a test can send any Host header, or hang up. */
function post(
	port: number,
	body: string,
	headers: Record<string, string> = {},
): { done: Promise<{ status: number; text: string }>; hangUp: () => void } {
	const sent = request({
		port,
		method: "POST",
		path: "/api/justask",
		headers: { "content-type": "application/json", ...headers },
	});
	const done = new Promise<{ status: number; text: string }>(
		(resolve, reject) => {
			sent.on("response", (res) => {
				let text = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					text += chunk;
				});
				res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
			});
			sent.on("error", reject);
		},
	);
	sent.end(body);
	return { done, hangUp: () => sent.destroy() };
}

const asked = JSON.stringify({
	request: "invoices from Acme",
	timeZone: "UTC",
});

describe("the README's toNode", () => {
	it("answers a request", async () => {
		const port = await serve(
			createSearchHandler({
				provider: fakeProvider({
					search: { acme: 0.9, none: 0.05, several: 0.05 },
				}),
				timeoutMs: 1_000,
				search,
			}),
		);

		const { status, text } = await post(port, asked).done;

		expect(status).toBe(200);
		expect(JSON.parse(text).search.item).toBe(1);
	});

	it("answers 400, not 500, to a Host header that is not a host", async () => {
		const port = await serve(
			createSearchHandler({ provider, timeoutMs: 1_000, search }),
		);

		const { status } = await post(port, JSON.stringify({ request: "x" }), {
			host: "[::1",
		}).done;

		expect(status).toBe(400);
	});

	it("says the body is empty when a body parser read it first, as express.json() does", async () => {
		const mount = toNode(
			createSearchHandler({ provider, timeoutMs: 1_000, search }),
		);
		const server = createServer(async (req, res) => {
			for await (const _ of req); // what express.json() does before the route
			mount(req, res).catch(() => {
				res.statusCode = 500;
				res.end();
			});
		});
		servers.push(server);
		await new Promise<void>((resolve) => server.listen(0, resolve));
		const { port } = server.address() as AddressInfo;

		const { status, text } = await post(port, asked).done;

		expect(status).toBe(400);
		expect(JSON.parse(text).error.message).toBe(
			"The body is empty: was it read before the handler, as express.json() does?",
		);
	});

	it("aborts the provider call when the browser hangs up", async () => {
		const port = await serve(
			createSearchHandler({ provider, timeoutMs: 5_000, search }),
		);
		const before = provider.calls.length;

		const { done, hangUp } = post(port, asked);
		done.catch(() => {});
		await expect.poll(() => provider.calls.length).toBe(before + 1);
		hangUp();

		await expect.poll(() => provider.calls[before]?.signal.aborted).toBe(true);
	});

	it("answers 499, not 500, when the browser hangs up mid upload (#240)", async () => {
		const handler = createSearchHandler({ provider, timeoutMs: 1_000, search });
		const answered: (number | "threw")[] = [];
		const port = await serve(async (httpRequest) => {
			try {
				const response = await handler(httpRequest);
				answered.push(response.status);
				return response;
			} catch (error) {
				answered.push("threw");
				throw error;
			}
		});

		// Half the body it declares, then gone.
		const sent = request({
			port,
			method: "POST",
			path: "/api/justask",
			headers: {
				"content-type": "application/json",
				"content-length": String(asked.length * 2),
			},
		});
		sent.on("error", () => {});
		sent.write(asked);
		await new Promise((resolve) => setTimeout(resolve, 50));
		sent.destroy();

		await expect.poll(() => answered).toEqual([499]);
	});

	it("stops reading a body past the handler's cap", async () => {
		const port = await serve(
			createSearchHandler({ provider, timeoutMs: 1_000, search }),
		);

		// A body that never ends, and no content-length: only reading no
		// further than the cap can answer it.
		const sent = request({
			port,
			method: "POST",
			path: "/api/justask",
			headers: { "content-type": "application/json" },
		});
		const chunk = " ".repeat(4096);
		const feed = setInterval(() => sent.write(chunk), 1);
		sent.on("error", () => {});
		try {
			const status = await new Promise<number | undefined>((resolve) =>
				sent.on("response", (res) => {
					res.resume();
					resolve(res.statusCode);
				}),
			);
			expect(status).toBe(413);
		} finally {
			clearInterval(feed);
			sent.destroy();
		}
	});

	it.each([
		["with no DOM types", ["es2023"]],
		["beside the DOM's types", ["es2023", "dom", "dom.iterable"]],
	])("compiles in a Node project %s", (_, lib) => {
		writeFileSync(join(temp, "package.json"), '{ "type": "module" }');
		writeFileSync(
			join(temp, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					target: "es2023",
					lib,
					module: "nodenext",
					moduleResolution: "nodenext",
					strict: true,
					exactOptionalPropertyTypes: true,
					verbatimModuleSyntax: true,
					skipLibCheck: true,
					noEmit: true,
					types: ["node"],
					typeRoots: [join(root, "node_modules/@types")],
				},
				files: [join(temp, "to-node.ts")],
			}),
		);
		const tsc = spawnSync(
			join(root, "node_modules/.bin/tsc"),
			["-p", join(temp, "tsconfig.json"), "--pretty", "false"],
			{ encoding: "utf8" },
		);

		expect(`${tsc.stdout}${tsc.stderr}`.replaceAll(temp, "").trim()).toBe("");
	});
});
