import { useEffect, useRef } from "react";
import {
	BUDGET_EXCEEDED,
	DEMO_PAUSED,
	KEY_OUT_OF_SERVICE,
	type Stopped,
	VISITOR_DAY_USED,
	VISITOR_MINUTE_USED,
} from "./api.ts";
import type { Content } from "./content/types.ts";

/** The repo a visitor clones to run justask on their own key. */
export const REPO_URL = "https://github.com/franklinmdev/justask";

/**
 * The demo's `fetch`, watching for the server's answers that stop live calls
 * on the owner's key (#109): the day's budget, the kill switch or this
 * visitor's limit (#110), 402, and a key TypeSafe refused, 503. It hands the
 * answer on untouched, so the hook still ends its call, and tells the page why.
 */
export function watchStops(
	fetchImpl: typeof fetch,
	onStop: (stopped: Stopped) => void,
): typeof fetch {
	return async (input, init) => {
		const response = await fetchImpl(input, init);
		const stopped = await stoppedBy(response);
		if (stopped) onStop(stopped);
		return response;
	};
}

async function stoppedBy(response: Response): Promise<Stopped | null> {
	if (response.status !== 402 && response.status !== 503) return null;
	try {
		const body = (await response.clone().json()) as {
			error?: { kind?: unknown; cause?: unknown; limit?: unknown };
		} | null;
		const { kind, cause, limit } = body?.error ?? {};
		if (kind === KEY_OUT_OF_SERVICE.error.kind) return "key";
		if (kind !== BUDGET_EXCEEDED.error.kind) return null;
		if (cause === BUDGET_EXCEEDED.error.cause) return "budget";
		if (cause === DEMO_PAUSED.error.cause) return "paused";
		if (cause !== VISITOR_MINUTE_USED.error.cause) return null;
		if (limit === VISITOR_MINUTE_USED.error.limit) return "minute";
		return limit === VISITOR_DAY_USED.error.limit ? "day" : null;
	} catch {
		// A body that is not JSON is not the demo's own answer: the page's usual error shows.
		return null;
	}
}

/**
 * In place of the case once a live call is stopped: why, then the ways on,
 * the case's recorded run and a clone of the repo. Never the case with every
 * field held, which would read as justask misreading the request. The other
 * cases' tabs open on their recorded runs as usual.
 */
export function StoppedNotice({
	content,
	stopped,
	onReplay,
}: {
	content: Content;
	stopped: Stopped;
	/** Replays the case's recorded run; absent when the case has none. */
	onReplay: (() => void) | null;
}) {
	const copy = content.copy.stopped;
	const { title, body } = copy[stopped];
	const heading = useRef<HTMLHeadingElement>(null);

	// The box the visitor typed in is gone; focus lands on what replaced it.
	useEffect(() => heading.current?.focus(), []);

	return (
		<section className="stopped" aria-labelledby="stopped-title">
			<h2 id="stopped-title" ref={heading} tabIndex={-1}>
				{title}
			</h2>
			<p>{body}</p>
			<div className="stopped-actions">
				{onReplay && (
					<button type="button" className="confirm" onClick={onReplay}>
						{copy.replay}
					</button>
				)}
				<a className="stopped-link" href={REPO_URL}>
					{copy.clone}
				</a>
			</div>
		</section>
	);
}
