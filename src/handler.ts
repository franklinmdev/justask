import { type AskError, type AskInput, ask, type SearchResult } from "./ask.ts";
import type { Card, CardFields, CardResult } from "./card.ts";
import type { Fields, Filter, FilterResult } from "./filter.ts";
import type { Facts, Provider, Usage } from "./provider.ts";
import type { Search } from "./search.ts";

/**
 * One handler per flow, each mounted at its own route: the browser never
 * chooses the flow, and each route owns its facts and limits.
 */
type HandlerConfig = {
	provider: Provider;
	/** How long the provider call may take before everything is held. No default. */
	timeoutMs: number;
	/**
	 * The host app's configuration, written as facts, such as
	 * `{ local_currency: "USD" }`. The handler writes `today` itself from the
	 * time zone the browser sends, so it cannot be configured.
	 */
	facts?: Facts;
	/** Called with the full error, cause included, which never reaches the browser. */
	onError?: (error: AskError) => void;
};

export type SearchHandlerConfig<T> = HandlerConfig & { search: Search<T> };

export type FilterHandlerConfig<F extends Fields> = HandlerConfig & {
	filter: Filter<F>;
};

export type CardHandlerConfig<F extends CardFields> = HandlerConfig & {
	card: Card<F>;
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

/**
 * The body of a 200 response from the search handler. `T` must survive JSON.
 * The call's cost and input tokens come only when the provider reports them.
 */
export type SearchHandlerResponse<T> = Usage & {
	search: SearchResult<T>;
	error?: HandlerError;
};

/** The body of a 200 response from the filter handler. Catalog values must survive JSON. */
export type FilterHandlerResponse<F extends Fields> = Usage & {
	filter: FilterResult<F>;
	error?: HandlerError;
};

/** The body of a 200 response from the card handler. Catalog values must survive JSON. */
export type CardHandlerResponse<F extends CardFields> = Usage & {
	card: CardResult<F>;
	error?: HandlerError;
};

/** The body of a 400 response. */
export type HandlerBadRequest = {
	error: { kind: "request"; message: string };
};

/**
 * A server handler from a standard Request to a standard Response, so it
 * mounts in any fetch-style server. It runs the search through `ask` with the
 * provider built on the server, so the key never reaches the browser; the
 * browser only sends the request and its time zone. A provider failure still
 * answers 200, with everything held and a typed error.
 */
export function createSearchHandler<T>(
	config: SearchHandlerConfig<T>,
): (httpRequest: Request) => Promise<Response> {
	const { search } = config;
	return serve(config, async (input) => {
		const result = await ask({ ...input, search });
		const response: SearchHandlerResponse<T> = {
			search: result.search,
			...usageOf(result),
		};
		return { response, error: result.error };
	});
}

/**
 * The filter's handler, the search handler's twin: it runs the filter through
 * `ask` and answers the filter object with every field's result. Date fields
 * read today from the browser's time zone.
 */
export function createFilterHandler<F extends Fields>(
	config: FilterHandlerConfig<F>,
): (httpRequest: Request) => Promise<Response> {
	const { filter } = config;
	return serve(config, async (input) => {
		const result = await ask({ ...input, filter });
		const response: FilterHandlerResponse<F> = {
			filter: result.filter,
			...usageOf(result),
		};
		return { response, error: result.error };
	});
}

/**
 * The card's handler, the filter handler's twin: it runs the card through
 * `ask` and answers the record with the intent and every field's result.
 * Date fields read today from the browser's time zone.
 */
export function createCardHandler<F extends CardFields>(
	config: CardHandlerConfig<F>,
): (httpRequest: Request) => Promise<Response> {
	const { card } = config;
	return serve(config, async (input) => {
		const result = await ask({ ...input, card });
		const response: CardHandlerResponse<F> = {
			card: result.card,
			...usageOf(result),
		};
		return { response, error: result.error };
	});
}

/**
 * Each figure `ask` reported, picked by name like the result, so a field
 * added to `ask`'s results never reaches the browser unseen.
 */
function usageOf({ costUsd, inputTokens }: Usage): Usage {
	return {
		...(costUsd !== undefined && { costUsd }),
		...(inputTokens !== undefined && { inputTokens }),
	};
}

type AskBase = Omit<AskInput<unknown>, "search">;

/** What every handler shares: POST only, the body read, today written, errors kept on the server. */
function serve(
	{ provider, timeoutMs, facts = {}, onError }: HandlerConfig,
	run: (input: AskBase) => Promise<{
		response: { error?: HandlerError };
		error: AskError | undefined;
	}>,
): (httpRequest: Request) => Promise<Response> {
	if ("today" in facts) {
		throw new TypeError(
			'justask: the handler writes the "today" fact from the browser\'s time zone; leave it out of facts',
		);
	}

	return async (httpRequest) => {
		if (httpRequest.method !== "POST") {
			return new Response(null, { status: 405, headers: { allow: "POST" } });
		}
		const read = await readBody(httpRequest);
		if ("error" in read) return badRequest(read.error);

		const now = new Date();
		const { response, error } = await run({
			request: read.body.request,
			facts: { today: todayFact(now, read.body.timeZone), ...facts },
			provider,
			timeoutMs,
		});
		if (error) {
			onError?.(error);
			response.error = forBrowser(error);
		}
		return Response.json(response);
	};
}

async function readBody(
	httpRequest: Request,
): Promise<{ body: HandlerRequest } | { error: string }> {
	let body: unknown;
	try {
		body = await httpRequest.json();
	} catch {
		return { error: "The body is not JSON" };
	}
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return { error: "The body is not a JSON object" };
	}
	const { request, timeZone } = body as Record<string, unknown>;
	if (typeof request !== "string") {
		return { error: '"request" must be a string' };
	}
	if (typeof timeZone !== "string") {
		return { error: '"timeZone" must be the browser\'s IANA time zone' };
	}
	try {
		new Intl.DateTimeFormat("en", { timeZone });
	} catch {
		return { error: `"${timeZone}" is not a time zone` };
	}
	return { body: { request, timeZone } };
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
