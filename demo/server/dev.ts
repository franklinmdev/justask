import { jevProvider } from "justask/jev";
import { createDemoHandler, logError } from "./handler.ts";
import { warmUp } from "./warm-up.ts";

const provider = jevProvider();

/**
 * The handler the dev server mounts, with the real Jev provider. It reads
 * TYPESAFE_API_KEY from the server's environment, which the Vite config loads
 * from .env; nothing here reaches the browser bundle.
 */
export const handle = createDemoHandler(provider, { onError: logError });

/**
 * One discarded call on the dev server's start, so the provider's cold start
 * falls on it and not on a visitor's first request, which would time out
 * (#65).
 */
export const warmOnStart = () => warmUp(provider, { times: 1 });
