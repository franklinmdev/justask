import {
	createContext,
	type KeyboardEvent,
	type ReactNode,
	useContext,
	useId,
	useMemo,
	useSyncExternalStore,
} from "react";
import { Calculator } from "./calculator.tsx";
import type { Case, Content } from "./content/types.ts";
import { formats } from "./format.ts";
import { type SnippetFile, snippetOf } from "./snippet.ts";
import type { Trace } from "./trace.ts";

/** At this width and up the hood sits beside the app; below it, a switch picks one. */
const WIDE = "(min-width: 1100px)";

function subscribe(onChange: () => void) {
	if (typeof matchMedia !== "function") return () => {};
	const query = matchMedia(WIDE);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

/** True on a desktop, and wherever the width cannot be read. */
function useWide(): boolean {
	return useSyncExternalStore(subscribe, () =>
		typeof matchMedia === "function" ? matchMedia(WIDE).matches : true,
	);
}

/** The hood's tabs, in the order they show. */
export const hoodViews = ["trace", "json", "code"] as const;

export type HoodView = (typeof hoodViews)[number];

/** What a phone shows of a case, in the switch's order: the app first. */
const hoodShown = ["app", "hood"] as const;

export type HoodShown = (typeof hoodShown)[number];

/**
 * Where the hood is, kept by the page so it holds across the cases: open or
 * hidden beside the app on a desktop, on a phone which of the two shows, and
 * which of its tabs is chosen.
 */
export type HoodPlace = {
	open: boolean;
	setOpen: (open: boolean) => void;
	shown: HoodShown;
	setShown: (shown: HoodShown) => void;
	view: HoodView;
	setView: (view: HoodView) => void;
};

/** What the hook a case uses is called, so the JSON tab names what it shows. */
const hookResult: Record<Case, string> = {
	table: "filter.result",
	form: "card.result",
	search: "search.result",
};

/**
 * The call the hood shows: the page's timing of it, and the result the hook
 * handed the app, while the next call may be on its way.
 */
export type ShownCall = {
	trace: Trace | null;
	result: unknown;
	loading: boolean;
};

export const HoodPlaceContext = createContext<HoodPlace | null>(null);

/**
 * The key a tab list moves on: the arrows step and wrap, Home and End jump.
 * Null for any other key.
 */
export function nextTab<T>(
	event: KeyboardEvent,
	tabs: readonly T[],
	current: T,
): T | null {
	const at = tabs.indexOf(current);
	const last = tabs.length - 1;
	switch (event.key) {
		case "ArrowRight":
			return tabs[at === last ? 0 : at + 1] ?? null;
		case "ArrowLeft":
			return tabs[at === 0 ? last : at - 1] ?? null;
		case "Home":
			return tabs[0] ?? null;
		case "End":
			return tabs[last] ?? null;
		default:
			return null;
	}
}

/**
 * One case of the showcase: the app, and under the hood what happened. On a
 * desktop the hood is a column beside the app with a toggle that hides it;
 * on a phone an "App | Under the hood" switch shows one at a time, the app
 * first. What is out of view is hidden, not unmounted, so the app keeps what
 * the person typed. The hood holds the call's strip, then the Trace, JSON
 * and Code tabs; `hood` is the Trace tab's panel. Below both, the cost
 * calculator prices a month from the call the hood shows.
 */
export function CaseLayout({
	content,
	caseName,
	call,
	labelledBy,
	hood,
	children,
}: {
	content: Content;
	caseName: Case;
	call: ShownCall;
	labelledBy: string;
	hood: ReactNode;
	children: ReactNode;
}) {
	const { copy } = content;
	const snippet = useMemo(
		() => snippetOf(caseName, content),
		[caseName, content],
	);
	const place = useContext(HoodPlaceContext);
	if (!place) throw new Error("A case needs the page's hood place");
	const wide = useWide();
	const appHidden = !wide && place.shown === "hood";
	const hoodHidden = wide ? !place.open : place.shown === "app";

	return (
		<>
			<div className="case" data-hood={hoodHidden ? "hidden" : "shown"}>
				<div className="case-bar">
					{wide ? (
						<button
							type="button"
							className="hood-toggle"
							aria-expanded={place.open}
							aria-controls={`${caseName}-hood`}
							onClick={() => place.setOpen(!place.open)}
						>
							{copy.hood}
						</button>
					) : (
						<fieldset className="show" aria-label={copy.showLabel}>
							{hoodShown.map((option) => (
								<button
									key={option}
									type="button"
									aria-pressed={place.shown === option}
									onClick={() => place.setShown(option)}
								>
									{option === "app" ? copy.app : copy.hood}
								</button>
							))}
						</fieldset>
					)}
				</div>
				<section
					className="app"
					aria-labelledby={labelledBy}
					hidden={appHidden}
				>
					{children}
				</section>
				<aside
					id={`${caseName}-hood`}
					className="hood"
					aria-label={copy.hood}
					hidden={hoodHidden}
				>
					<Strip content={content} call={call} />
					<div className="hood-tabs" role="tablist" aria-label={copy.hoodViews}>
						{hoodViews.map((view) => (
							<button
								key={view}
								type="button"
								role="tab"
								id={`${caseName}-hood-tab-${view}`}
								aria-selected={view === place.view}
								aria-controls={`${caseName}-hood-${view}`}
								tabIndex={view === place.view ? 0 : -1}
								onClick={() => place.setView(view)}
								onKeyDown={(event) => {
									const next = nextTab(event, hoodViews, place.view);
									if (next === null) return;
									event.preventDefault();
									place.setView(next);
									document
										.getElementById(`${caseName}-hood-tab-${next}`)
										?.focus();
								}}
							>
								{copy[view]}
							</button>
						))}
					</div>
					<HoodPanel caseName={caseName} view="trace" shown={place.view}>
						{hood}
					</HoodPanel>
					<HoodPanel caseName={caseName} view="json" shown={place.view}>
						{call.trace ? (
							<CodeFile
								file={{
									name: hookResult[caseName],
									code: JSON.stringify(call.result, null, 2),
								}}
								stale={call.loading}
							/>
						) : (
							<p className="muted">{copy.jsonIdle}</p>
						)}
					</HoodPanel>
					<HoodPanel caseName={caseName} view="code" shown={place.view}>
						<CodeFile file={snippet.server} />
						<CodeFile file={snippet.client} />
					</HoodPanel>
				</aside>
			</div>
			<Calculator content={content} trace={call.trace} loading={call.loading} />
		</>
	);
}

/** One of the hood's tab panels, hidden while another tab is chosen. */
function HoodPanel({
	caseName,
	view,
	shown,
	children,
}: {
	/** The case the hood is in: every case stays mounted, so its ids name it. */
	caseName: Case;
	view: HoodView;
	shown: HoodView;
	children: ReactNode;
}) {
	return (
		<div
			role="tabpanel"
			id={`${caseName}-hood-${view}`}
			aria-labelledby={`${caseName}-hood-tab-${view}`}
			className="hood-panel"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: a tab panel is a tab stop, so keys reach it when nothing inside takes the focus (ARIA tabs pattern).
			tabIndex={0}
			hidden={view !== shown}
		>
			{children}
		</div>
	);
}

/**
 * The strip over the hood's tabs: the displayed call's latency, the second
 * call when `ask` made one (ADR 0013), then its input tokens and cost, each
 * saying so when the provider did not report it.
 */
function Strip({ content, call }: { content: Content; call: ShownCall }) {
	const { copy } = content;
	const format = formats(content.locale);
	const { trace } = call;
	return (
		<section
			className="strip"
			aria-label={copy.strip}
			data-stale={call.loading || undefined}
		>
			{trace ? (
				<dl className="strip-figures">
					<div>
						<dt>{copy.latency}</dt>
						<dd className="data">{trace.ms} ms</dd>
					</div>
					{trace.retried && (
						<div>
							<dt>{copy.calls}</dt>
							<dd>
								<span className="data">2</span>{" "}
								<span className="strip-note">{copy.retried}</span>
							</dd>
						</div>
					)}
					<div>
						<dt>{copy.inputTokens}</dt>
						{trace.inputTokens === undefined ? (
							<dd className="unreported">{copy.notReported}</dd>
						) : (
							<dd className="data">{format.count(trace.inputTokens)}</dd>
						)}
					</div>
					<div>
						<dt>{copy.cost}</dt>
						{trace.costUsd === undefined ? (
							<dd className="unreported">{copy.notReported}</dd>
						) : (
							<dd className="data">{format.cost(trace.costUsd)}</dd>
						)}
					</div>
				</dl>
			) : (
				<p className="muted">{copy.stripIdle}</p>
			)}
		</section>
	);
}

/**
 * One file of code or JSON, named by its caption. It scrolls on its own, so
 * a long line never widens the page, and takes the focus so keys scroll it.
 */
function CodeFile({ file, stale }: { file: SnippetFile; stale?: boolean }) {
	// Named from its caption by reference, which every browser reads alike.
	const caption = useId();
	return (
		<figure
			className="code-file"
			aria-labelledby={caption}
			data-stale={stale || undefined}
		>
			<figcaption id={caption} className="data">
				{file.name}
			</figcaption>
			{/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region needs a tab stop to be scrolled by keys. */}
			<pre tabIndex={0}>
				<code>{file.code}</code>
			</pre>
		</figure>
	);
}
