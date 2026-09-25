import { useEffect, useRef } from "react";
import { BUDGET_EXCEEDED, KEY_OUT_OF_SERVICE, type Stopped } from "./api.ts";
import type { Content } from "./content/types.ts";

/** The repo a visitor clones to run justask on their own key. */
export const REPO_URL = "https://github.com/franklinmdev/justask";

/**
 * The demo's `fetch`, watching for the server's answers that stop live calls
 * on the owner's key (#109): the day's budget, 402, and a key TypeSafe
 * refused, 503. It hands the answer on untouched, so the hook still ends its
 * call, and tells the page why.
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
			error?: { kind?: unknown };
		} | null;
		const kind = body?.error?.kind;
		return kind === BUDGET_EXCEEDED.error.kind ||
			kind === KEY_OUT_OF_SERVICE.error.kind
			? kind
			: null;
	} catch {
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
	const { title, body } =
		stopped === "budget_exceeded" ? copy.budget : copy.key;
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
