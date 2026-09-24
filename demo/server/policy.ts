import type { HandlerBadRequest } from "justask";
import { REQUEST_LIMIT } from "../src/api.ts";

/**
 * The demo's own checks on a handler route, before the core handler runs.
 * Every limit of the public demo lives here, so the core stays free of policy
 * (#29). Answers the refusal, or undefined when the request may go on.
 *
 * A request from another origin is refused. One that names no origin passes:
 * every browser names it on a POST, and a script can name any origin it likes,
 * so refusing it would stop only the demo's own recording script.
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

/** The posted request's text, or undefined when the body is not one; the core handler answers that. */
async function requestText(request: Request): Promise<string | undefined> {
	try {
		const body: unknown = await request.clone().json();
		const text = (body as { request?: unknown } | null)?.request;
		return typeof text === "string" ? text : undefined;
	} catch {
		return undefined;
	}
}
