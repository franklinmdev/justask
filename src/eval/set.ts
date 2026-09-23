/**
 * What a search row expects: `item` names the candidate id the person means,
 * `nothing` has no item to find, and `ambiguous` could mean more than one, so
 * the item must stay held.
 */
export type EvalKind = "item" | "nothing" | "ambiguous";

/** One request of an eval set with the result a person expects. */
export type EvalRow = {
	id: string;
	request: string;
	kind: EvalKind;
	/** The expected candidate id on an item row; null on the others. */
	expected: string | null;
};

const KEYS = new Set(["id", "request", "kind", "expected"]);

function isKind(kind: unknown): kind is EvalKind {
	return kind === "item" || kind === "nothing" || kind === "ambiguous";
}

/**
 * Reads an eval set, one JSON object per line: `{ "id", "request", "kind",
 * "expected" }`. A row without an id is named by its line. Throws on the
 * first row that is not one, naming its line.
 */
export function parseEvalSet(jsonl: string): EvalRow[] {
	const rows: EvalRow[] = [];
	const lineOf = new Map<string, number>();
	jsonl.split("\n").forEach((text, index) => {
		if (!text.trim()) return;
		const line = index + 1;
		const invalid = (why: string) =>
			new Error(`justask: eval set line ${line}: ${why}`);
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			throw invalid("not JSON");
		}
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			throw invalid("not a JSON object");
		}
		const unknownKey = Object.keys(parsed).find((key) => !KEYS.has(key));
		if (unknownKey) throw invalid(`unknown key "${unknownKey}"`);
		const {
			id = `line-${line}`,
			request,
			kind,
			expected = null,
		} = parsed as Record<string, unknown>;
		if (typeof id !== "string" || !id) {
			throw invalid('"id" must be a non-empty string');
		}
		if (typeof request !== "string" || !request.trim()) {
			throw invalid('"request" must be a non-empty string');
		}
		if (!isKind(kind)) {
			throw invalid('"kind" must be item, nothing or ambiguous');
		}
		if (kind === "item" && (typeof expected !== "string" || !expected)) {
			throw invalid('an item row expects a candidate id in "expected"');
		}
		if (kind !== "item" && expected !== null) {
			throw invalid(
				`${kind === "ambiguous" ? "an" : "a"} ${kind} row expects no item; leave "expected" out`,
			);
		}
		const used = lineOf.get(id);
		if (used) throw invalid(`the id "${id}" is already used on line ${used}`);
		lineOf.set(id, line);
		rows.push({ id, request, kind, expected: expected as string | null });
	});
	if (rows.length === 0) throw new Error("justask: the eval set has no rows");
	return rows;
}
