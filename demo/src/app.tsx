import {
	Activity,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { Stopped } from "./api.ts";
import { CalculatorInputsContext } from "./calculator.tsx";
import { CardPage } from "./card-page.tsx";
import { english } from "./content/en.ts";
import { spanish } from "./content/es.ts";
import type { Case, Language } from "./content/types.ts";
import { retryOnCpuLimit } from "./cpu-limit.ts";
import { FilterPage } from "./filter-page.tsx";
import { type Recordings, recordings as recordingFiles } from "./recording.ts";
import { forgetPlayed } from "./replay.ts";
import { SearchPage } from "./search-page.tsx";
import {
	HoodPlaceContext,
	type HoodShown,
	type HoodView,
	nextTab,
} from "./showcase.tsx";
import { StoppedNotice, watchStops } from "./stopped.tsx";
import { ThemeToggle } from "./theme.tsx";

const contents = { en: english, es: spanish };

const languages: { language: Language; name: string }[] = [
	{ language: "en", name: "English" },
	{ language: "es", name: "Español" },
];

const cases: Case[] = ["table", "form", "search"];

type View = { language: Language; case: Case };

/** The case and the language live in the URL, so each view is a link. */
function viewFromUrl(): View {
	const params = new URLSearchParams(location.search);
	const named = params.get("case");
	return {
		language: params.get("lang") === "es" ? "es" : "en",
		case: named === "form" || named === "search" ? named : "table",
	};
}

/** The defaults, the table in English, stay out of the URL. */
function hrefOf(view: View): string {
	const params = new URLSearchParams();
	if (view.case !== "table") params.set("case", view.case);
	if (view.language !== "en") params.set("lang", view.language);
	const query = params.toString();
	return query ? `?${query}` : location.pathname;
}

/**
 * The showcase: a header with the case tabs, the theme and the language
 * toggle, then one case with its hood. The language toggle switches the UI
 * text, the suggested requests and the data, and starts the case over, since
 * the other language is another catalog. Every case opens on its recorded
 * run; with `recordings` null every case opens idle. A case out of view is
 * hidden in an <Activity>, never unmounted, so each keeps what the person
 * did in it (#135); the other language is another catalog, so a language
 * switch drops them all. Once the server stops live calls on the owner's key,
 * the case gives way to a notice until the visitor opens a case or replays
 * this one (#109), which types the recorded run in again.
 */
export function App({
	fetch,
	recordings = recordingFiles,
}: {
	fetch?: typeof globalThis.fetch;
	recordings?: Recordings | null;
}) {
	const [view, setView] = useState(viewFromUrl);
	const [open, setOpen] = useState(true);
	const [shown, setShown] = useState<HoodShown>("app");
	const [hoodView, setHoodView] = useState<HoodView>("trace");
	// The calculator's starting point, a round figure for the person to change.
	const [users, setUsers] = useState("1000");
	const [actions, setActions] = useState("10");
	const [stopped, setStopped] = useState<Stopped | null>(null);
	const { language, case: shownCase } = view;
	// The cases opened in this language, each kept once opened. One opened later
	// mounts then, so the page first renders only its own case.
	const [opened, setOpened] = useState({ language, cases: [shownCase] });
	if (opened.language !== language) {
		setOpened({ language, cases: [shownCase] });
	} else if (!opened.cases.includes(shownCase)) {
		setOpened({ language, cases: [...opened.cases, shownCase] });
	}
	const content = contents[language];
	const { copy } = content;

	useEffect(() => {
		document.documentElement.lang = language;
		document.title = `${copy.cases[shownCase]} · ${copy.product}`;
	}, [language, shownCase, copy]);

	useEffect(() => {
		const sync = () => setView(viewFromUrl());
		addEventListener("popstate", sync);
		return () => removeEventListener("popstate", sync);
	}, []);

	/**
	 * A click adds a history entry; an arrow step replaces it, so Back goes to
	 * the case before the keys, not through every tab they passed.
	 */
	function show(next: View, step = false) {
		if (next.language === language && next.case === shownCase) return;
		setStopped(null);
		if (step) history.replaceState(null, "", hrefOf(next));
		else history.pushState(null, "", hrefOf(next));
		setView(next);
	}

	function go(event: MouseEvent<HTMLAnchorElement>, next: View) {
		// A modified click opens the link as the browser would.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		show(next);
	}

	function step(event: KeyboardEvent<HTMLAnchorElement>) {
		const next = nextTab(event, cases, shownCase);
		if (next === null) return;
		event.preventDefault();
		show({ language, case: next }, true);
		document.getElementById(`case-tab-${next}`)?.focus();
	}

	// One function for the page's life, so no hook sees a new fetch on a render.
	const sent = useMemo(
		() => watchStops(retryOnCpuLimit(fetch ?? globalThis.fetch), setStopped),
		[fetch],
	);
	const recording = recordings?.[shownCase][language] ?? null;
	const shared = { content, fetch: sent };
	/**
	 * A case once opened: shown while it is the one open, hidden otherwise. The
	 * notice unmounts the case it replaces, so the case opens again on its
	 * recorded run.
	 */
	const mountedCase = (option: Case, page: ReactNode) =>
		option === shownCase
			? !stopped && <Activity key={`${option}-${language}`}>{page}</Activity>
			: opened.cases.includes(option) && (
					<Activity key={`${option}-${language}`} mode="hidden">
						{page}
					</Activity>
				);
	return (
		<HoodPlaceContext
			value={{
				open,
				setOpen,
				shown,
				setShown,
				view: hoodView,
				setView: setHoodView,
			}}
		>
			<a className="skip" href="#main">
				{copy.skip}
			</a>
			<header className="header">
				<div className="brand">
					<span className="product">{copy.product}</span>
					<h1 className="visually-hidden">{copy.cases[shownCase]}</h1>
					<div className="cases" role="tablist" aria-label={copy.casesLabel}>
						{cases.map((option) => (
							<a
								key={option}
								id={`case-tab-${option}`}
								href={hrefOf({ language, case: option })}
								role="tab"
								aria-selected={option === shownCase}
								aria-controls="case"
								tabIndex={option === shownCase ? 0 : -1}
								onClick={(event) => go(event, { language, case: option })}
								onKeyDown={step}
							>
								{copy.cases[option]}
							</a>
						))}
					</div>
				</div>
				<div className="controls">
					<ThemeToggle copy={copy} />
					<nav className="languages" aria-label={copy.languageLabel}>
						{languages.map(({ language: option, name }) => (
							<a
								key={option}
								href={hrefOf({ language: option, case: shownCase })}
								lang={option}
								aria-current={option === language ? "true" : undefined}
								onClick={(event) =>
									go(event, { language: option, case: shownCase })
								}
							>
								{name}
							</a>
						))}
					</nav>
				</div>
			</header>
			<main id="main" className="layout">
				<div
					id="case"
					role="tabpanel"
					aria-labelledby={`case-tab-${shownCase}`}
				>
					<CalculatorInputsContext
						value={{
							users: { value: users, set: setUsers },
							actions: { value: actions, set: setActions },
						}}
					>
						{stopped && (
							<StoppedNotice
								content={content}
								stopped={stopped}
								onReplay={
									recording &&
									(() => {
										forgetPlayed(recording);
										setStopped(null);
									})
								}
							/>
						)}
						{mountedCase(
							"table",
							<FilterPage
								recording={recordings?.table[language] ?? null}
								{...shared}
							/>,
						)}
						{mountedCase(
							"form",
							<CardPage
								recording={recordings?.form[language] ?? null}
								{...shared}
							/>,
						)}
						{mountedCase(
							"search",
							<SearchPage
								recording={recordings?.search[language] ?? null}
								{...shared}
							/>,
						)}
					</CalculatorInputsContext>
				</div>
			</main>
		</HoodPlaceContext>
	);
}
