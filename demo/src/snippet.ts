import {
	demoCard,
	demoFilter,
	demoSearch,
	FACTS,
	SHORTLIST_LIMIT,
	TIMEOUT_MS,
} from "../server/handler.ts";
import type { Case, Content } from "./content/types.ts";
import { DEBOUNCE_MS } from "./parts.tsx";

/** One file of a case's code: its name and what it holds. */
export type SnippetFile = { name: string; code: string };

/** The code that reproduces a case: the server's handler, then the React side. */
export type Snippet = { server: SnippetFile; client: SnippetFile };

/** Source text written as it is, for what a value alone cannot say, such as a function. */
type Source = { source: string };

const source = (text: string): Source => ({ source: text });

function isSource(value: unknown): value is Source {
	return typeof value === "object" && value !== null && "source" in value;
}

/**
 * A value as a JavaScript literal, two spaces a level. A function has no
 * literal, so one left in the value throws rather than showing as nothing.
 */
function literal(value: unknown, indent = ""): string {
	if (isSource(value)) return value.source;
	if (typeof value === "function") {
		throw new TypeError("A snippet cannot write a function; name its source");
	}
	if (typeof value !== "object" || value === null) return JSON.stringify(value);
	const inner = `${indent}  `;
	const lines = Array.isArray(value)
		? value.map((item) => `${inner}${literal(item, inner)},`)
		: Object.entries(value).map(
				([key, item]) => `${inner}${key}: ${literal(item, inner)},`,
			);
	const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
	return `${open}\n${lines.join("\n")}\n${indent}${close}`;
}

/**
 * The declared fields, each catalog's shortlist written as the catalog it
 * reads, which the page's own declarations keep in functions.
 */
function withCatalogs(
	fields: Record<string, object>,
	catalogs: Record<string, string>,
): Record<string, object> {
	return Object.fromEntries(
		Object.entries(fields).map(([name, field]) => {
			if (!("shortlist" in field)) return [name, field];
			const catalog = catalogs[name];
			if (catalog === undefined) {
				throw new TypeError(`No catalog is named for the ${name} field`);
			}
			return [name, { ...field, shortlist: source(`() => ${catalog}`) }];
		}),
	);
}

/** The handler's module: the provider on the server, and the flow as the demo declares it. */
function server(
	handler: string,
	imports: string[],
	catalogs: string[],
	flow: string,
	declared: object,
): SnippetFile {
	const config = literal({
		provider: source("jevProvider()"),
		timeoutMs: TIMEOUT_MS,
		facts: FACTS,
		[flow]: declared,
	});
	return {
		name: "handler.ts",
		code: [
			`import { ${[handler, ...imports].sort().join(", ")} } from "justask";`,
			'import { jevProvider } from "justask/jev";',
			`import { ${[...catalogs].sort().join(", ")} } from "./catalog";`,
			"",
			`export const handler = ${handler}(${config});`,
			"",
		].join("\n"),
	};
}

function tableSnippet(content: Content): Snippet {
	const declared = demoFilter(content);
	const { copy } = content;
	const catalogs = { vendor: "vendors", status: "statuses" };
	return {
		server: server(
			"createFilterHandler",
			[],
			Object.values(catalogs),
			"filter",
			{ ...declared, fields: withCatalogs(declared.fields, catalogs) },
		),
		client: {
			name: "Transactions.tsx",
			code: `import type { FilterValue } from "justask";
import { FilterBox, FilterConfirm, useFilter } from "justask/react";
import type { TransactionFields } from "./types";

export function Transactions({
  onApply,
}: {
  onApply: (filter: FilterValue<TransactionFields>) => void;
}) {
  const filter = useFilter<TransactionFields>({
    endpoint: ${JSON.stringify(`/api/filter/${content.language}`)},
    timing: { on: "type", debounceMs: ${DEBOUNCE_MS} },
    onConfirm: onApply,
  });
  return (
    <>
      <FilterBox filter={filter} label=${JSON.stringify(copy.filter.boxLabel)} />
      <FilterConfirm filter={filter}>${copy.filter.confirm}</FilterConfirm>
    </>
  );
}
`,
		},
	};
}

function formSnippet(content: Content): Snippet {
	const declared = demoCard(content);
	const { copy } = content;
	const catalogs = { vendor: "vendors", tags: "tags" };
	return {
		server: server("createCardHandler", [], Object.values(catalogs), "card", {
			...declared,
			fields: withCatalogs(declared.fields, catalogs),
		}),
		client: {
			name: "NewExpense.tsx",
			code: `import type { CardValue } from "justask";
import { CardBox, CardConfirm, useCard } from "justask/react";
import type { ExpenseFields } from "./types";

export function NewExpense({
  onSave,
}: {
  onSave: (expense: CardValue<ExpenseFields>) => void;
}) {
  const card = useCard<ExpenseFields>({
    endpoint: ${JSON.stringify(`/api/card/${content.language}`)},
    onConfirm: onSave,
  });
  return (
    <>
      <CardBox card={card} label=${JSON.stringify(copy.card.boxLabel)} />
      <CardConfirm card={card}>${copy.card.confirm}</CardConfirm>
    </>
  );
}
`,
		},
	};
}

function searchSnippet(content: Content): Snippet {
	const declared = demoSearch(content);
	const { copy } = content;
	return {
		server: server(
			"createSearchHandler",
			["fuzzyShortlist"],
			["vendors"],
			"search",
			{
				...declared,
				shortlist: source(
					`fuzzyShortlist(vendors, { limit: ${SHORTLIST_LIMIT} })`,
				),
			},
		),
		client: {
			name: "VendorSearch.tsx",
			code: `import { SearchBox, SearchItem, useSearch } from "justask/react";
import type { Vendor } from "./types";

export function VendorSearch({
  onChoose,
}: {
  onChoose: (vendor: Vendor) => void;
}) {
  const search = useSearch<Vendor>({
    endpoint: ${JSON.stringify(`/api/search/${content.language}`)},
    timing: { on: "type", debounceMs: ${DEBOUNCE_MS} },
    onChoose,
  });
  return (
    <>
      <SearchBox search={search} label=${JSON.stringify(copy.boxLabel)} />
      <SearchItem search={search}>{(vendor) => vendor.name}</SearchItem>
    </>
  );
}
`,
		},
	};
}

/**
 * The code that reproduces a case, written from the very declarations the
 * demo's handler serves, so the snippet cannot drift from the case it shows.
 */
export function snippetOf(shown: Case, content: Content): Snippet {
	switch (shown) {
		case "table":
			return tableSnippet(content);
		case "form":
			return formSnippet(content);
		case "search":
			return searchSnippet(content);
	}
}
