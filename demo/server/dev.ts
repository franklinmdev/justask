import { jevProvider } from "justask/jev";
import { createDemoHandler, logError } from "./handler.ts";
import { warmUp } from "./warm-up.ts";

const provider = jevProvider();

/**
 * The handler the dev server mounts, with the real Jev provider. It reads
 * TYPESAFE_API_KEY from the server's environment, which the Vite config loads
 * from .env; nothing here reaches the browser bundle. Its ledger is in
 * memory, so the day's spend starts over with the server; DEMO_KILL_SWITCH,
 * set to any value, turns the kill switch on, as on the Worker.
 */
export const handle = createDemoHandler(provider, {
	onError: logError,
	killSwitch: Boolean(process.env.DEMO_KILL_SWITCH),
});

/**
 * One discarded call on the dev server's start, so the provider's cold start
 * falls on it and not on a visitor's first request, which would time out
 * (#65).
 */
export const warmOnStart = () => warmUp(provider, { times: 1 });
