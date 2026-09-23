import {
	createContext,
	type KeyboardEvent,
	type ReactNode,
	useContext,
	useSyncExternalStore,
} from "react";
import type { Content } from "./content/types.ts";

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

/**
 * Where the hood is, kept by the page so it holds across the cases: open or
 * hidden beside the app on a desktop, and on a phone which of the two shows.
 */
export type HoodPlace = {
	open: boolean;
	setOpen: (open: boolean) => void;
	shown: "app" | "hood";
	setShown: (shown: "app" | "hood") => void;
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
 * the person typed.
 */
export function Case({
	content,
	labelledBy,
	hood,
	children,
}: {
	content: Content;
	labelledBy: string;
	hood: ReactNode;
	children: ReactNode;
}) {
	const { copy } = content;
	const place = useContext(HoodPlaceContext);
	if (!place) throw new Error("A case needs the page's hood place");
	const wide = useWide();
	const appHidden = !wide && place.shown === "hood";
	const hoodHidden = wide ? !place.open : place.shown === "app";

	return (
		<div className="case" data-hood={hoodHidden ? "hidden" : "shown"}>
			<div className="case-bar">
				{wide ? (
					<button
						type="button"
						className="hood-toggle"
						aria-expanded={place.open}
						aria-controls="hood"
						onClick={() => place.setOpen(!place.open)}
					>
						{copy.hood}
					</button>
				) : (
					<fieldset className="show" aria-label={copy.showLabel}>
						{(["app", "hood"] as const).map((option) => (
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
			<section className="app" aria-labelledby={labelledBy} hidden={appHidden}>
				{children}
			</section>
			<aside
				id="hood"
				className="hood"
				aria-label={copy.hood}
				hidden={hoodHidden}
			>
				<div className="hood-tabs" role="tablist" aria-label={copy.hoodViews}>
					<button
						type="button"
						role="tab"
						id="hood-tab-trace"
						aria-selected="true"
						aria-controls="hood-trace"
					>
						{copy.trace}
					</button>
				</div>
				<div
					role="tabpanel"
					id="hood-trace"
					aria-labelledby="hood-tab-trace"
					className="hood-panel"
				>
					{hood}
				</div>
			</aside>
		</div>
	);
}
