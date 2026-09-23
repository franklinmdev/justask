import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Writes a run log: its header as the first line, then each row as soon as
 * `answer` returns it, so a crash keeps every call already paid for. The log
 * must not exist yet: a saved run is never overwritten.
 */
export async function writeRunLog<H extends object, In, Out>(
	log: string,
	header: H,
	set: In[],
	answer: (row: In) => Promise<Out>,
): Promise<{ startedAt: string } & H & { rows: Out[] }> {
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
		const started = { startedAt: new Date().toISOString(), ...header };
		await file.write(`${JSON.stringify(started)}\n`);
		const rows: Out[] = [];
		for (const row of set) {
			const answered = await answer(row);
			rows.push(answered);
			await file.write(`${JSON.stringify(answered)}\n`);
		}
		return { ...started, rows };
	} finally {
		await file.close();
	}
}

/** Reads a run log back as its header line and its row lines, each parsed. */
export async function readRunLog(
	log: string,
): Promise<{ header: Record<string, unknown> | undefined; rows: unknown[] }> {
	const [header, ...rows] = (await readFile(log, "utf8"))
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line));
	return { header, rows };
}
