import type { HandlerBadRequest } from "@justask/core";
// The one file of the demo that reaches into src/: the core handler's own body
// reader, kept out of the package's API, so the two never read a body apart (#250).
import { readCapped } from "../../src/capped-body.ts";
import { REQUEST_LIMIT } from "../src/api.ts";

/**
 * The demo's own checks on a handler route, before the core handler runs.
 * Every limit of the public demo lives here, so the core stays free of policy
 * (ADR 0014, #29). Answers the refusal, or undefined when the request may go on.
 *
 * A request from another origin is refused. One that names no origin passes:
 * every browser names it on a POST, and a script can name any origin it likes,
 * so refusing it would stop only the demo's own recording script. The owner
 * kept it so on 2026-09-24: the check is friction, and the real limits are
 * the budget's and the per-visitor limits' (#109, #110).
 */
export async function refusal(request: Request): Promise<Response | undefined> {
	const origin = request.headers.get("origin");
	if (origin !== null && origin !== new URL(request.url).origin) {
		return new Response(null, { status: 403 });
	}
	const text = await requestText(request);
	if (text !== undefined && text.length > REQUEST_LIMIT) {
		const body: HandlerBadRequest = {
			error: {
				kind: "request",
				message: `The request is over ${REQUEST_LIMIT} characters`,
			},
		};
		return Response.json(body, { status: 400 });
	}
	return undefined;
}

/**
 * The posted request's text, or undefined when the body is not one or is
 * over the core handler's cap; the core handler answers those. Read from a
 * clone with the core handler's own reader, so the policy reads no further
 * than its cap either.
 */
async function requestText(request: Request): Promise<string | undefined> {
	try {
		const json = await readCapped(request.clone());
		if (json === null) return undefined;
		const body: unknown = JSON.parse(json);
		const text = (body as { request?: unknown } | null)?.request;
		return typeof text === "string" ? text : undefined;
	} catch {
		return undefined;
	}
}
