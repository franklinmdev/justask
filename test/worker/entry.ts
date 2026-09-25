import { english } from "../../demo/src/content/en.ts";
import { durableWorker } from "../../demo/worker/durable.ts";
import { fakeProvider } from "../fake-provider.ts";

export { DemoLedger } from "../../demo/worker/durable.ts";

/** The deployed Worker's shape with the fake provider: every search answered, each call $0.4. */
export default durableWorker(
	fakeProvider(
		{
			search: {
				...Object.fromEntries(english.vendors.map(({ id }) => [id, 0])),
				none: 1,
				several: 0,
			},
		},
		{ costUsd: 0.4 },
	),
);
