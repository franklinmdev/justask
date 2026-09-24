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
import { evalSets } from "../eval/sets.ts";
import type { Language } from "../src/content/types.ts";

// The .env holds the token's pair beside the key; skipped when the pair's id is already set.
loadKeyEnv(undefined, "CF_ACCESS_CLIENT_ID");

const [base, rounds = "1"] = process.argv.slice(2);
if (!base || !/^[1-9]\d*$/.test(rounds)) {
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
type Flow = (typeof flows)[number];
const languages: Language[] = ["en", "es"];

/** A dev set's requests, in file order. */
function requests(flow: Flow, language: Language): string[] {
	const file = new URL(
		`../eval/${evalSets(flow, { dev: { verdict: false } }).file(language, "dev")}`,
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
			for (const [row, request] of requests(flow, language).entries()) {
				const sent = performance.now();
				const response = await fetch(
					new URL(`/api/${flow}/${language}`, base),
					{
						method: "POST",
						// Access answers a token it does not accept with a redirect to its login page.
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
				const wall = Math.round(performance.now() - sent);
				console.log(
					`round ${round} ${flow}/${language} row ${row + 1}: ${response.status} in ${wall} ms`,
				);
				// Access refused the token, so every later request would be refused too.
				if ([301, 302, 303, 307, 401, 403].includes(response.status)) {
					throw new Error(
						"justask: Access refused the service token; the Worker needs a policy with the Service Auth action for it (docs/workers.md, Deploy)",
					);
				}
			}
		}
	}
}
console.log(`window: ${started.toISOString()} to ${new Date().toISOString()}`);
