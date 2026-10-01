import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const demo = join(dirname(fileURLToPath(import.meta.url)), "..", "demo");

/** The headers `demo/public/_headers` gives every page and asset, by lowercase name. */
const headers = (() => {
	const lines = readFileSync(join(demo, "public", "_headers"), "utf8")
		.split("\n")
		.filter((line) => line.trim() && !line.trim().startsWith("#"));
	expect(lines[0]).toBe("/*");
	return new Map(
		lines.slice(1).map((line) => {
			const at = line.indexOf(":");
			return [
				line.slice(0, at).trim().toLowerCase(),
				line.slice(at + 1).trim(),
			];
		}),
	);
})();

/** The CSP's directives, by name. */
const csp = new Map(
	(headers.get("content-security-policy") ?? "")
		.split(";")
		.map((directive) => directive.trim().split(/\s+/))
		.filter(([name]) => name)
		.map(([name = "", ...sources]) => [name, sources]),
);

describe("the demo's security headers (#250)", () => {
	it("lets the page's one inline script run by its hash, and no other", () => {
		const html = readFileSync(join(demo, "index.html"), "utf8");
		const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
			([, code]) => code ?? "",
		);
		expect(inline).toHaveLength(1);
		const hash = createHash("sha256")
			.update(inline[0] ?? "")
			.digest("base64");

		expect(csp.get("script-src")).toEqual(["'self'", `'sha256-${hash}'`]);
	});

	it("loads everything else from the demo's own origin only", () => {
		expect(csp.get("default-src")).toEqual(["'self'"]);
		expect(csp.get("object-src")).toEqual(["'none'"]);
		expect(csp.get("base-uri")).toEqual(["'none'"]);
	});

	it("lets no page frame the demo", () => {
		expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
		expect(headers.get("x-frame-options")).toBe("DENY");
	});

	it("sends no referrer and no sniffing", () => {
		expect(headers.get("referrer-policy")).toBe("no-referrer");
		expect(headers.get("x-content-type-options")).toBe("nosniff");
	});
});
