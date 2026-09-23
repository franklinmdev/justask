import { type MouseEvent, useEffect, useState } from "react";
import { english } from "./content/en.ts";
import { spanish } from "./content/es.ts";
import type { Language, Page } from "./content/types.ts";
import { FilterPage } from "./filter-page.tsx";
import { SearchPage } from "./search-page.tsx";
import { ThemeToggle } from "./theme.tsx";

const contents = { en: english, es: spanish };

const languages: { language: Language; name: string }[] = [
	{ language: "en", name: "English" },
	{ language: "es", name: "Español" },
];

const pages: Page[] = ["search", "filter"];

type View = { language: Language; page: Page };

/** The page and the language live in the URL, so each view is a link. */
function viewFromUrl(): View {
	const params = new URLSearchParams(location.search);
	return {
		language: params.get("lang") === "es" ? "es" : "en",
		page: params.get("page") === "filter" ? "filter" : "search",
	};
}

/** The defaults, search in English, stay out of the URL. */
function hrefOf({ language, page }: View): string {
	const params = new URLSearchParams();
	if (page !== "search") params.set("page", page);
	if (language !== "en") params.set("lang", language);
	const query = params.toString();
	return query ? `?${query}` : location.pathname;
}

/**
 * The demo: a header with the pages, the theme and the language toggle, then
 * one flow's page. The toggle switches the UI text, the suggested requests
 * and the data, and starts the page over, since the other language is
 * another catalog.
 */
export function App({ fetch }: { fetch?: typeof globalThis.fetch }) {
	const [view, setView] = useState(viewFromUrl);
	const { language, page } = view;
	const content = contents[language];
	const { copy } = content;

	useEffect(() => {
		document.documentElement.lang = language;
		document.title = `${copy.pages[page]} · ${copy.product}`;
	}, [language, page, copy]);

	useEffect(() => {
		const sync = () => setView(viewFromUrl());
		addEventListener("popstate", sync);
		return () => removeEventListener("popstate", sync);
	}, []);

	function go(event: MouseEvent<HTMLAnchorElement>, next: View) {
		// A modified click opens the link as the browser would.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		if (next.language === language && next.page === page) return;
		history.pushState(null, "", hrefOf(next));
		setView(next);
	}

	const shared = { content, ...(fetch && { fetch }) };
	return (
		<>
			<a className="skip" href="#main">
				{copy.skip}
			</a>
			<header className="header">
				<div className="brand">
					<span className="product">{copy.product}</span>
					<h1 className="visually-hidden">{copy.pages[page]}</h1>
					<nav className="pages" aria-label={copy.pagesLabel}>
						{pages.map((option) => (
							<a
								key={option}
								href={hrefOf({ language, page: option })}
								aria-current={option === page ? "page" : undefined}
								onClick={(event) => go(event, { language, page: option })}
							>
								{copy.pages[option]}
							</a>
						))}
					</nav>
				</div>
				<div className="controls">
					<ThemeToggle copy={copy} />
					<nav className="languages" aria-label={copy.languageLabel}>
						{languages.map(({ language: option, name }) => (
							<a
								key={option}
								href={hrefOf({ language: option, page })}
								lang={option}
								aria-current={option === language ? "true" : undefined}
								onClick={(event) => go(event, { language: option, page })}
							>
								{name}
							</a>
						))}
					</nav>
				</div>
			</header>
			{page === "search" ? (
				<SearchPage key={language} {...shared} />
			) : (
				<FilterPage key={language} {...shared} />
			)}
		</>
	);
}
