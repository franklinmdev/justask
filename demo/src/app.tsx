import { type MouseEvent, useEffect, useState } from "react";
import { english } from "./content/en.ts";
import { spanish } from "./content/es.ts";
import type { Language } from "./content/types.ts";
import { SearchPage } from "./search-page.tsx";

const contents = { en: english, es: spanish };

const languages: { language: Language; name: string }[] = [
	{ language: "en", name: "English" },
	{ language: "es", name: "Español" },
];

/** The language lives in the URL, so each view is a link. */
function languageFromUrl(): Language {
	return new URLSearchParams(location.search).get("lang") === "es"
		? "es"
		: "en";
}

/**
 * The demo: a header with the language toggle, then the search page. The
 * toggle switches the UI text, the suggested requests and the data, and
 * starts the search over, since the other language is another catalog.
 */
export function App({ fetch }: { fetch?: typeof globalThis.fetch }) {
	const [language, setLanguage] = useState(languageFromUrl);
	const content = contents[language];
	const { copy } = content;

	useEffect(() => {
		document.documentElement.lang = language;
		document.title = `${copy.page} · ${copy.product}`;
	}, [language, copy]);

	useEffect(() => {
		const sync = () => setLanguage(languageFromUrl());
		addEventListener("popstate", sync);
		return () => removeEventListener("popstate", sync);
	}, []);

	function switchTo(event: MouseEvent<HTMLAnchorElement>, next: Language) {
		// A modified click opens the link as the browser would.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		if (next === language) return;
		history.pushState(null, "", `?lang=${next}`);
		setLanguage(next);
	}

	return (
		<>
			<a className="skip" href="#search">
				{copy.skip}
			</a>
			<header className="header">
				<div className="brand">
					<span className="product">{copy.product}</span>
					<span className="divider" aria-hidden="true">
						/
					</span>
					<h1>{copy.page}</h1>
				</div>
				<nav className="languages" aria-label={copy.languageLabel}>
					{languages.map(({ language: option, name }) => (
						<a
							key={option}
							href={`?lang=${option}`}
							lang={option}
							aria-current={option === language ? "true" : undefined}
							onClick={(event) => switchTo(event, option)}
						>
							{name}
						</a>
					))}
				</nav>
			</header>
			<SearchPage key={language} content={content} {...(fetch && { fetch })} />
		</>
	);
}
