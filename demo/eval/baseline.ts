// The probes' median over saved run logs of any flow, with no call: the
// baseline to write into demo/eval/probe.ts before the next verdict run.
//
//   node --conditions=justask-source demo/eval/baseline.ts <run log>...
//
// Name the most recent normal runs, by path from the repo root.

import { type Probes, probeMedian, readProbes } from "@justask/core/eval";

const logs = process.argv.slice(2);
if (logs.length === 0) {
	console.error("usage: baseline.ts <run log>...");
	process.exit(1);
}
const probes: Probes[] = [];
for (const log of logs) {
	const read = await readProbes(log);
	if (!read) {
		console.error(`${log} was saved before probes; name runs that sent them`);
		process.exit(1);
	}
	probes.push(read);
}
const median = probeMedian(probes);
console.log(
	median === null
		? "every probe failed: no baseline"
		: `median of ${probes.length} ${probes.length === 1 ? "run's" : "runs'"} probes: ${Math.round(median)} ms`,
);
