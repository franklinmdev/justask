// The deployed Worker's CPU time per flow, by hand, never in CI (#107).
// Sends every dev row of the search, filter and card eval sets, in both
// languages, to the deployed demo through Cloudflare Access, one at a time,
// `rounds` times over; real Jev calls on the owner's key, on the Worker.
// Reads the Access service token from the environment or from .env, and
// prints the run's window, to read the CPU time from Workers Logs
// (docs/workers.md, Measuring CPU).
//
//   node --conditions=source demo/worker/measure.ts <deployed url> [rounds]

import { readFileSync } from "node:fs";
import { loadKeyEnv } from "../../scripts/load-env.ts";
import type { Language } from "../src/content/types.ts";

loadKeyEnv(undefined, "CF_ACCESS_CLIENT_ID");

const [base, rounds = "1"] = process.argv.slice(2);
if (!base) {
	throw new Error(
		"usage: node --conditions=source demo/worker/measure.ts <deployed url> [rounds]",
	);
}
const id = process.env.CF_ACCESS_CLIENT_ID;
const secret = process.env.CF_ACCESS_CLIENT_SECRET;
if (!id || !secret) {
	throw new Error(
		"justask: set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET, the Access service token's pair (docs/workers.md)",
	);
}

const flows = ["search", "filter", "card"] as const;
const languages: Language[] = ["en", "es"];

/** A dev set's requests, in file order. */
function requests(flow: string, language: Language): string[] {
	const file = new URL(
		`../eval/${flow}-${language}.dev.jsonl`,
		import.meta.url,
	);
	return readFileSync(file, "utf8")
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => (JSON.parse(line) as { request: string }).request);
}

const started = new Date();
for (let round = 1; round <= Number(rounds); round++) {
	for (const flow of flows) {
		for (const language of languages) {
			const walls: number[] = [];
			const failed: number[] = [];
			for (const request of requests(flow, language)) {
				const sent = performance.now();
				const response = await fetch(
					new URL(`/api/${flow}/${language}`, base),
					{
						method: "POST",
						// Access answers a missing or wrong token with a redirect to its login page.
						redirect: "manual",
						headers: {
							"content-type": "application/json",
							"CF-Access-Client-Id": id,
							"CF-Access-Client-Secret": secret,
						},
						body: JSON.stringify({
							request,
							timeZone: "America/Santo_Domingo",
						}),
					},
				);
				await response.arrayBuffer();
				walls.push(Math.round(performance.now() - sent));
				if (response.status !== 200) failed.push(response.status);
			}
			console.log(
				`round ${round} ${flow}/${language}: ${walls.length} requests, wall ms ${walls.join(" ")}${failed.length ? `, not 200: ${failed.join(" ")}` : ""}`,
			);
		}
	}
}
console.log(`window: ${started.toISOString()} to ${new Date().toISOString()}`);
