import { type AskError, ask, type SearchResult } from "./ask.ts";
import type { Facts, Provider } from "./provider.ts";
import type { Search } from "./search.ts";

export type HandlerConfig<T> = {
	provider: Provider;
	/** How long the provider call may take before everything is held. No default. */
	timeoutMs: number;
	/**
	 * The host app's configuration, written as facts, such as
	 * `{ local_currency: "USD" }`. The handler writes `today` itself from the
	 * time zone the browser sends, so it cannot be configured.
	 */
	facts?: Facts;
	search: Search<T>;
	/** Called with the full error, cause included, which never reaches the browser. */
	onError?: (error: AskError) => void;
};

/** What the browser posts: the request and its own time zone, an IANA name. */
export type HandlerRequest = {
	request: string;
	timeZone: string;
};

/** A provider error as the browser sees it: no cause, and a fixed message. */
export type HandlerError =
	| { kind: "provider"; message: string }
	| { kind: "timeout"; message: string; timeoutMs: number };

/** The body of a 200 response. `T` must survive JSON. */
export type HandlerResponse<T> = {
	search: SearchResult<T>;
	error?: HandlerError;
};

/** The body of a 400 response. */
export type HandlerBadRequest = {
	error: { kind: "request"; message: string };
};

/**
 * A server handler from a standard Request to a standard Response, so it
 * mounts in any fetch-style server. It runs `ask` with the provider built on
 * the server, so the key never reaches the browser; the browser only sends the
 * request and its time zone. A provider failure still answers 200, with
 * everything held and a typed error.
 */
export function createHandler<T>(
	config: HandlerConfig<T>,
): (request: Request) => Promise<Response> {
	const { provider, timeoutMs, facts = {}, search, onError } = config;
	if ("today" in facts) {
		throw new TypeError(
			'justask: the handler writes the "today" fact from the browser\'s time zone; leave it out of facts',
		);
	}

	return async (request) => {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { allow: "POST" } });
		}
		const body = await readBody(request);
		if (typeof body === "string") return badRequest(body);

		const now = new Date();
		const result = await ask({
			request: body.request,
			facts: { today: todayFact(now, body.timeZone), ...facts },
			provider,
			timeoutMs,
			search,
		});
		if (result.error) onError?.(result.error);
		const response: HandlerResponse<T> = { search: result.search };
		if (result.error) response.error = forBrowser(result.error);
		return Response.json(response);
	};
}

/** The parsed body, or why it cannot be read. */
async function readBody(request: Request): Promise<HandlerRequest | string> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return "The body is not JSON";
	}
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return "The body is not a JSON object";
	}
	const { request: text, timeZone } = body as Record<string, unknown>;
	if (typeof text !== "string") return '"request" must be a string';
	if (typeof timeZone !== "string") {
		return '"timeZone" must be the browser\'s IANA time zone';
	}
	try {
		new Intl.DateTimeFormat("en", { timeZone });
	} catch {
		return `"${timeZone}" is not a time zone`;
	}
	return { request: text, timeZone };
}

function badRequest(message: string): Response {
	const body: HandlerBadRequest = { error: { kind: "request", message } };
	return Response.json(body, { status: 400 });
}

/** The cause, and a provider's own message, may carry server details such as the key. */
function forBrowser(error: AskError): HandlerError {
	return error.kind === "timeout"
		? { kind: "timeout", message: error.message, timeoutMs: error.timeoutMs }
		: { kind: "provider", message: "The provider failed" };
}

/**
 * Today in the person's time zone, written as in the lab:
 * "Today is Monday 2026-09-21 (lunes 21 de septiembre de 2026)."
 */
function todayFact(now: Date, timeZone: string): string {
	const part = (locale: string, options: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(now);
	// en-CA formats a date as YYYY-MM-DD.
	const iso = part("en-CA", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const weekday = part("en", { weekday: "long" });
	const spanish = `${part("es", { weekday: "long" })} ${part("es", { day: "numeric" })} de ${part("es", { month: "long" })} de ${part("es", { year: "numeric" })}`;
	return `Today is ${weekday} ${iso} (${spanish}).`;
}
