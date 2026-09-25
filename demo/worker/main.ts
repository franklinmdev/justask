import { jevProvider } from "justask/jev";
import { durableWorker } from "./durable.ts";

export { DemoLedger } from "./durable.ts";

/**
 * The Worker's entry (wrangler.jsonc), with the real Jev provider. Its
 * TypeSafe client reads TYPESAFE_API_KEY from process.env on the first call,
 * which the Workers runtime fills from the Worker's secret under
 * nodejs_compat.
 */
export default durableWorker(jevProvider());
