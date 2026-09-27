/**
 * Runs the packed `justask/react` on whichever React is installed beside this
 * file, as a host app on the oldest React the peer range allows would (#175).
 * `scripts/react-peer.sh` installs it with the React named; the repo's own
 * tests only ever see the React in its lockfile. It renders every piece on
 * the server, then makes a real round trip in jsdom: each hook posts to its
 * handler in process, with a provider that answers from the labels, and the
 * answer lands. No real provider is called.
 */
import { JSDOM } from "jsdom";
import {
	type Candidate,
	createCardHandler,
	createFilterHandler,
	createSearchHandler,
	type Provider,
} from "justask";
import {
	CardBox,
	CardConfirm,
	CardEntry,
	CardStatus,
	CardUndo,
	FilterBox,
	FilterConfirm,
	FilterEmpty,
	FilterFields,
	SearchBox,
	SearchEmpty,
	SearchItem,
	useCard,
	useFilter,
	useSearch,
} from "justask/react";
import { createElement as h, version } from "react";
import { renderToString } from "react-dom/server";

type Vendor = { name: string };

const acme: Candidate<Vendor> = {
	id: "acme",
	description: "Acme Supplies, office paper and toner",
	value: { name: "Acme Supplies" },
};

/** Picks `acme` wherever it is a label, and spreads the rest evenly. */
const provider: Provider = {
	async answer({ questions }) {
		const answers: Record<string, Record<string, number>> = {};
		for (const { id, labels } of questions) {
			const names = labels.map(({ label }) => label);
			answers[id] = Object.fromEntries(
				names.map((label) => [
					label,
					names.includes("acme")
						? label === "acme"
							? 1
							: 0
						: 1 / names.length,
				]),
			);
		}
		return { answers };
	},
};

const fields = {
	vendor: {
		kind: "catalog",
		description: "the vendor",
		gate: 0.5,
		shortlist: () => [acme],
	},
} as const;

const handlers = {
	"/search": createSearchHandler<Vendor>({
		provider,
		timeoutMs: 1_000,
		search: {
			description: "the vendor the request means",
			gate: 0.5,
			shortlist: () => [acme],
		},
	}),
	"/filter": createFilterHandler({
		provider,
		timeoutMs: 1_000,
		filter: { description: "an invoice", fields },
	}),
	"/card": createCardHandler({
		provider,
		timeoutMs: 1_000,
		card: { description: "an expense", gate: 0.5, fields },
	}),
};

const calls: string[] = [];
const fetchInProcess: typeof fetch = async (input, init) => {
	const path = String(input) as keyof typeof handlers;
	calls.push(path);
	return handlers[path](new Request(`http://localhost${path}`, init));
};

const enter = { on: "enter" } as const;
const seen: {
	search?: ReturnType<typeof useSearch<Vendor>>;
	filter?: ReturnType<typeof useFilter<typeof fields>>;
	card?: ReturnType<typeof useCard<typeof fields>>;
} = {};

function Page() {
	const search = useSearch<Vendor>({
		endpoint: "/search",
		timing: enter,
		onChoose: () => {},
		fetch: fetchInProcess,
	});
	const filter = useFilter<typeof fields>({
		endpoint: "/filter",
		timing: enter,
		onConfirm: () => {},
		fetch: fetchInProcess,
	});
	const card = useCard<typeof fields>({
		endpoint: "/card",
		onConfirm: () => {},
		fetch: fetchInProcess,
	});
	Object.assign(seen, { search, filter, card });
	return h(
		"main",
		null,
		h(SearchBox, { search, label: "Find a vendor" }),
		// Without JSX a render prop the types require goes in as `children`.
		// biome-ignore lint/correctness/noChildrenProp: see above.
		h(SearchItem<Vendor>, { search, children: (vendor) => vendor.name }),
		h(SearchEmpty, { search }, "No vendor matches"),
		h(FilterBox, { filter, label: "Filter" }),
		h(FilterFields<typeof fields>, {
			filter,
			label: "Filters",
			render: { vendor: (vendor) => String(vendor) },
			removeLabel: (name) => `Remove ${name}`,
			removedLabel: (name) => `Removed ${name}`,
		}),
		h(FilterEmpty, { filter }, "Nothing to filter"),
		h(FilterConfirm, { filter }, "Apply"),
		h(CardBox, { card, label: "Describe it" }),
		h(CardStatus<typeof fields>, {
			card,
			announce: ({ filled }) => `Filled: ${filled.join(", ")}`,
			unanswered: "Not read",
		}),
		h(CardEntry<typeof fields, "vendor">, {
			card,
			name: "vendor",
			// biome-ignore lint/correctness/noChildrenProp: as SearchItem's.
			children: ({ value }) => h("output", null, String(value ?? "")),
		}),
		h(CardConfirm, { card }, "Save"),
		h(CardUndo, { card }, "Saved"),
	);
}

function check(what: string, ok: boolean) {
	if (!ok) throw new Error(`React ${version}: ${what}`);
	console.log(`ok  ${what}`);
}

async function until(what: string, done: () => boolean) {
	const start = Date.now();
	while (!done()) {
		if (Date.now() - start > 5_000) check(what, false);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	check(what, true);
}

console.log(`React ${version}`);
check(
	"every piece renders on the server",
	renderToString(h(Page)).includes("Find a vendor"),
);
// The server's hooks are spent; the browser's replace them.
for (const flow of ["search", "filter", "card"] as const) delete seen[flow];

const dom = new JSDOM("<!doctype html><main id=root></main>", {
	url: "http://localhost/",
});
for (const name of ["window", "document", "navigator", "HTMLElement", "Node"]) {
	Object.defineProperty(globalThis, name, {
		configurable: true,
		value: dom.window[name as keyof typeof dom.window],
	});
}
const { createRoot } = await import("react-dom/client");
const root = createRoot(dom.window.document.getElementById("root") as Element);
root.render(h(Page));
await until("the hooks mount in the browser", () => seen.search !== undefined);

for (const flow of ["search", "filter", "card"] as const) {
	seen[flow]?.setRequest("acme");
	await until(
		`${flow} holds the request`,
		() => seen[flow]?.request === "acme",
	);
	seen[flow]?.submit();
	await until(
		`${flow} answers after one call`,
		() => seen[flow]?.answered === true && seen[flow]?.loading === false,
	);
}
check(
	"the search item is the one picked",
	seen.search?.item?.name === "Acme Supplies",
);
check("one call per flow", calls.join() === "/search,/filter,/card");
root.unmount();
