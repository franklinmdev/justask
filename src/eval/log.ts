import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ProbeSender, Probes } from "./probe.ts";

/**
 * Writes a run log: its header as the first line, then each row as soon as
 * `answer` returns it, so a crash keeps every call already paid for. Given
 * probes, it sends them before the rows, into the header, and again after,
 * on a last line of their own. The log must not exist yet: a saved run is
 * never overwritten.
 */
export async function writeRunLog<H extends object, In, Out>(
	log: string,
	header: H,
	set: In[],
	answer: (row: In) => Promise<Out>,
	probes?: ProbeSender,
): Promise<{ startedAt: string; probes?: Probes } & H & { rows: Out[] }> {
	await mkdir(dirname(log), { recursive: true });
	const file = await open(log, "wx").catch((error: unknown) => {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new Error(
				`justask: the run log ${log} exists already; a saved run is never overwritten`,
			);
		}
		throw error;
	});
	try {
		const startedAt = new Date().toISOString();
		const before = probes && {
			probes: { baselineMs: probes.baselineMs, before: await probes.send() },
		};
		const started = { startedAt, ...header, ...before };
		await file.write(`${JSON.stringify(started)}\n`);
		const rows: Out[] = [];
		for (const row of set) {
			const answered = await answer(row);
			rows.push(answered);
			await file.write(`${JSON.stringify(answered)}\n`);
		}
		if (!probes || !before) return { ...started, rows };
		const after = await probes.send();
		await file.write(`${JSON.stringify({ [PROBES_AFTER]: after })}\n`);
		return {
			...started,
			probes: { ...before.probes, after },
			rows,
		};
	} finally {
		await file.close();
	}
}

/** The key of the last line, which holds the probes sent after the rows. */
const PROBES_AFTER = "probesAfter";

/**
 * Reads a run log back as its header line and its row lines, each parsed,
 * with the probes sent after the rows folded into the header's.
 */
export async function readRunLog(
	log: string,
): Promise<{ header: Record<string, unknown> | undefined; rows: unknown[] }> {
	const [header, ...rows] = (await readFile(log, "utf8"))
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line));
	const last = rows.at(-1) as Record<string, unknown> | undefined;
	if (header?.probes && last && PROBES_AFTER in last) {
		rows.pop();
		return {
			header: {
				...header,
				probes: { ...header.probes, after: last[PROBES_AFTER] },
			},
			rows,
		};
	}
	return { header, rows };
}
