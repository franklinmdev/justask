import type { Candidate } from "@justask/core";
import {
	demoCard,
	demoFilter,
	demoSearch,
	FACTS,
	SHORTLIST_LIMIT,
	TIMEOUT_MS,
} from "../server/handler.ts";
import { cardEndpoint, filterEndpoint, searchEndpoint } from "./api.ts";
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
 * One of the host app's catalogs, written into the handler's file as the
 * demo serves it: its name in the code, the type of its values, and its rows.
 */
type Catalog = { name: string; type: string; rows: Candidate<unknown>[] };

/**
 * The type a catalog's values share: a union of its strings, or an object
 * type read from its first row's keys.
 */
function typeOf(rows: Candidate<unknown>[]): string {
	const values = rows.map(({ value }) => value);
	if (values.every((value) => typeof value === "string")) {
		return values.map((value) => JSON.stringify(value)).join(" | ");
	}
	const [first] = values;
	if (typeof first !== "object" || first === null) {
		throw new TypeError("A catalog holds strings or objects");
	}
	const keys = Object.entries(first).map(
		([key, value]) => `  ${key}: ${typeof value};`,
	);
	return `{\n${keys.join("\n")}\n}`;
}

/** The catalog a field reads, which every catalog field names. */
function catalogOf(catalogs: Record<string, Catalog>, name: string): Catalog {
	const catalog = catalogs[name];
	if (catalog === undefined) {
		throw new TypeError(`No catalog is named for the ${name} field`);
	}
	return catalog;
}

/**
 * The type justask names a date field by: a date on a card declares its
 * direction, so it is the card's date field.
 */
type DateType = "DateField" | "CardDateField";

/**
 * Each declared field's type as justask names it, a catalog's with the type
 * of the catalog it reads.
 */
function fieldTypes(
	fields: Record<string, object>,
	catalogs: Record<string, Catalog>,
	dateType: DateType,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(fields).map(([name, field]) => {
			const kind = "kind" in field ? field.kind : undefined;
			switch (kind) {
				case "catalog": {
					const catalog = catalogOf(catalogs, name);
					const several = "several" in field && field.several === true;
					return [
						name,
						`${several ? "SeveralCatalogField" : "CatalogField"}<${catalog.type}>`,
					];
				}
				case "date":
					return [name, dateType];
				case "amount":
					return [name, "AmountField"];
				default:
					throw new TypeError(`A snippet cannot write the ${name} field`);
			}
		}),
	);
}

/**
 * The declared fields, each catalog's shortlist written as the catalog it
 * reads, which the page's own declarations keep in functions.
 */
function withCatalogs(
	fields: Record<string, object>,
	catalogs: Record<string, Catalog>,
): Record<string, object> {
	return Object.fromEntries(
		Object.entries(fields).map(([name, field]) => {
			if (!("shortlist" in field)) return [name, field];
			const { name: catalog } = catalogOf(catalogs, name);
			return [name, { ...field, shortlist: source(`() => ${catalog}`) }];
		}),
	);
}

/**
 * The handler's module, whole: justask's imports, the host app's types and
 * catalogs as the demo serves them, and the flow as the demo declares it,
 * with the provider on the server. Nothing else is imported, so it runs as
 * copied.
 */
function server({
	handler,
	values,
	imports,
	catalogs,
	types,
	flow,
	declared,
}: {
	handler: string;
	/** The handler's type argument. */
	values: string;
	/** What else the file takes from justask: its types and functions. */
	imports: string[];
	catalogs: Catalog[];
	/** The host app's own types after the catalogs' value types, by name. */
	types: Record<string, string>;
	flow: string;
	declared: object;
}): SnippetFile {
	const config = literal({
		provider: source("jevProvider()"),
		timeoutMs: TIMEOUT_MS,
		facts: FACTS,
		[flow]: declared,
	});
	const hostTypes = [
		...new Map(catalogs.map(({ type, rows }) => [type, typeOf(rows)] as const)),
		...Object.entries(types),
	];
	const fromJustask = [handler, ...imports, "Candidate"]
		.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
		.map((name) => (/^[A-Z]/.test(name) ? `type ${name}` : name));
	return {
		name: "handler.ts",
		code: [
			`import {\n${fromJustask.map((name) => `  ${name},`).join("\n")}\n} from "@justask/core";`,
			'import { jevProvider } from "@justask/core/jev";',
			"",
			...hostTypes.map(([name, type]) => `export type ${name} = ${type};\n`),
			...catalogs.map(
				({ name, type, rows }) =>
					`const ${name}: Candidate<${type}>[] = ${literal(rows)};\n`,
			),
			`export const handler = ${handler}<${values}>(${config});`,
			"",
		].join("\n"),
	};
}

/** A catalog-backed field set's declaration, its types and the imports they need. */
function fieldsOf(
	fields: Record<string, object>,
	catalogs: Record<string, Catalog>,
	dateType: DateType,
) {
	const types = fieldTypes(fields, catalogs, dateType);
	const record = Object.entries(types)
		.map(([name, type]) => `  ${name}: ${type};`)
		.join("\n");
	return {
		type: `{\n${record}\n}`,
		imports: [
			...new Set(Object.values(types).map((type) => type.replace(/<.*/, ""))),
		],
		catalogs: [...new Set(Object.values(catalogs))],
		fields: withCatalogs(fields, catalogs),
	};
}

function vendorsOf(content: Content): Catalog {
	return { name: "vendors", type: "Vendor", rows: content.vendors };
}

function tableSnippet(content: Content): Snippet {
	const declared = demoFilter(content);
	const { copy } = content;
	const fields = fieldsOf(
		declared.fields,
		{
			vendor: vendorsOf(content),
			status: {
				name: "statuses",
				type: "TransactionStatus",
				rows: content.statuses,
			},
		},
		"DateField",
	);
	return {
		server: server({
			handler: "createFilterHandler",
			values: "TransactionFields",
			imports: fields.imports,
			catalogs: fields.catalogs,
			types: { TransactionFields: fields.type },
			flow: "filter",
			declared: { ...declared, fields: fields.fields },
		}),
		client: {
			name: "Transactions.tsx",
			code: `import type { FilterValue } from "@justask/core";
import { FilterBox, useFilter } from "@justask/core/react";
import { useEffect } from "react";
import type { TransactionFields } from "./handler";

export function Transactions({
  onApply,
}: {
  onApply: (filter: FilterValue<TransactionFields>) => void;
}) {
  const filter = useFilter<TransactionFields>({
    endpoint: ${JSON.stringify(filterEndpoint(content.language))},
    timing: { on: "type", debounceMs: ${DEBOUNCE_MS} },
    onConfirm: onApply,
  });
  // Filtering is reversible, so each answer applies with no click.
  useEffect(() => {
    if (filter.ready) filter.confirm();
  });
  return (
    <FilterBox filter={filter} label=${JSON.stringify(copy.filter.boxLabel)} />
  );
}
`,
		},
	};
}

function formSnippet(content: Content): Snippet {
	const declared = demoCard(content);
	const { copy } = content;
	const fields = fieldsOf(
		declared.fields,
		{
			vendor: vendorsOf(content),
			tags: { name: "tags", type: "Tag", rows: content.tags },
		},
		"CardDateField",
	);
	return {
		server: server({
			handler: "createCardHandler",
			values: "ExpenseFields",
			imports: fields.imports,
			catalogs: fields.catalogs,
			types: { ExpenseFields: fields.type },
			flow: "card",
			declared: { ...declared, fields: fields.fields },
		}),
		client: {
			name: "NewExpense.tsx",
			code: `import type { CardValue } from "@justask/core";
import { CardBox, CardConfirm, CardEntry, useCard } from "@justask/core/react";
import type { ExpenseFields } from "./handler";

export function NewExpense({
  onSave,
}: {
  onSave: (expense: CardValue<ExpenseFields>) => void;
}) {
  const card = useCard<ExpenseFields>({
    endpoint: ${JSON.stringify(cardEndpoint(content.language))},
    onConfirm: onSave,
  });
  return (
    <>
      <CardBox card={card} label=${JSON.stringify(copy.card.boxLabel)} />
      <CardEntry card={card} name="total">
        {({ value, set, filledBy }) => (
          <label>
            ${copy.card.fields.total}
            {filledBy === "answer" && " (${copy.card.fromRequest})"}
            <input
              type="number"
              step="0.01"
              value={value?.value ?? ""}
              onChange={(event) => {
                const amount = event.target.valueAsNumber;
                set(Number.isNaN(amount) ? undefined : { value: amount });
              }}
            />
          </label>
        )}
      </CardEntry>
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
		server: server({
			handler: "createSearchHandler",
			values: "Vendor",
			imports: ["fuzzyShortlist"],
			catalogs: [vendorsOf(content)],
			types: {},
			flow: "search",
			declared: {
				...declared,
				shortlist: source(
					`fuzzyShortlist(vendors, { limit: ${SHORTLIST_LIMIT} })`,
				),
			},
		}),
		client: {
			name: "VendorSearch.tsx",
			code: `import { SearchBox, SearchItem, useSearch } from "@justask/core/react";
import type { Vendor } from "./handler";

export function VendorSearch({
  onChoose,
}: {
  onChoose: (vendor: Vendor) => void;
}) {
  const search = useSearch<Vendor>({
    endpoint: ${JSON.stringify(searchEndpoint(content.language))},
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
 * The code that reproduces a case, written from the very declarations and
 * catalogs the demo's handler serves, so the snippet cannot drift from the
 * case it shows, and runs as copied.
 */
export function snippetOf(shown: Case, content: Content): Snippet {
	return snippets[shown](content);
}

const snippets: Record<Case, (content: Content) => Snippet> = {
	table: tableSnippet,
	form: formSnippet,
	search: searchSnippet,
};
