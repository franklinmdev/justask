import { type CardRun, scoreCardRun } from "justask/eval";
import { english } from "../src/content/en.ts";
import { spanish } from "../src/content/es.ts";
import type { Content, Language } from "../src/content/types.ts";

const OFFICE = "office";
const QUESTION = `tags_${OFFICE}`;

/** The office tag's label, as this content serves it. */
export const servedLabel = (content: Content) => {
	const label = content.tags.find(({ id }) => id === OFFICE)?.description;
	if (label === undefined) throw new Error("the demo serves no office tag");
	return label;
};

/**
 * #77's office labels, each changing one thing from the one the demo serves
 * (`current`): `backups` names backups among the services, `short` keeps the
 * label's head and drops its list, and `rest` names what the tag is not
 * instead of what it is, after `short` showed the list is what fills it. The
 * probe runs measure them; the demo serves `current` alone.
 */
export const OFFICE_LABELS: Record<Language, Record<string, string>> = {
	en: {
		current: servedLabel(english),
		backups:
			"office: what keeps the business running, such as supplies, equipment, software, hosting, backups, repairs, cleaning and window washing, printing, couriers, payroll and HR, legal advice and insurance",
		short: "office: what keeps the business running",
		rest: "office: any business expense that is not meals or travel",
	},
	es: {
		current: servedLabel(spanish),
		backups:
			"oficina: lo que mantiene el negocio en marcha, como artículos, equipos, software, hosting, respaldos, reparaciones, limpieza y ventanas, imprenta, mensajería, nómina y recursos humanos, asesoría legal y seguros",
		short: "oficina: lo que mantiene el negocio en marcha",
		rest: "oficina: cualquier gasto del negocio que no sea comida ni viajes",
	},
};

/** The demo's content with the office tag read by one of #77's labels, and nothing else changed. */
export function withOfficeLabel(content: Content, label: string): Content {
	const description = OFFICE_LABELS[content.language][label];
	if (description === undefined) {
		throw new Error(`no office label named ${label}`);
	}
	return {
		...content,
		tags: content.tags.map((tag) =>
			tag.id === OFFICE ? { ...tag, description } : tag,
		),
	};
}

export type OfficePick = {
	id: string;
	request: string;
	/** The label that won the office tag's question, and its probability. */
	pick: string;
	probability: number;
	/** The intent's `new_record`, which gates the card but not the tag's question. */
	newRecord: number | undefined;
};

export type OfficePicks = {
	/** Rows whose office question has an answer. */
	asked: number;
	/** Rows where `yes` won at or above the tags gate: the tag fills, the intent aside. */
	yes: number;
	/** Per label, the rows it won, whatever its probability. */
	won: Record<string, number>;
	rows: OfficePick[];
};

/**
 * The office tag's own question over a probe run, read at the run's tags
 * gate. It reads the tag, not the card: a card the intent held still counts
 * its tag's pick, since #77 asks why the tag says "not mentioned".
 */
export function officePicks(run: CardRun): OfficePicks {
	const gate = run.gates.tags ?? 0;
	const rows: OfficePick[] = [];
	for (const row of run.rows) {
		const answer = row.answers[QUESTION];
		if (!answer) continue;
		const [pick, probability] = Object.entries(answer).reduce((best, next) =>
			next[1] > best[1] ? next : best,
		);
		rows.push({
			id: row.id,
			request: row.request,
			pick,
			probability,
			newRecord: row.answers.intent?.new_record,
		});
	}
	const won: Record<string, number> = {};
	for (const { pick } of rows) won[pick] = (won[pick] ?? 0) + 1;
	return {
		asked: rows.length,
		yes: rows.filter(
			({ pick, probability }) => pick === "yes" && probability >= gate,
		).length,
		won,
		rows,
	};
}

export type TagGap = {
	id: string;
	request: string;
	/** Every tag's question answered, each winning label with its probability. */
	picks: string;
	/**
	 * The tags left the gap an office vendor fills (ADR 0012): every tag
	 * answered `not_mentioned`, or office `yes` at any probability.
	 */
	gap: boolean;
	/** The card filled office from the vendor, where the row expects no office: a false fill. */
	filled: boolean;
};

export type TagGaps = { rows: TagGap[]; gaps: number; filled: number };

/**
 * #79's probes: records at an office vendor that bought something else. It
 * reads the tags' own questions, whatever the vendor and the intent did, for
 * how often the provider leaves the gap the rule fills, and the scored card
 * for how often the rule filled it: a miss the scorer blames on the vendor.
 */
export function tagGaps(run: CardRun): TagGaps {
	const falseFills = new Set(
		scoreCardRun(run)
			.misses.filter(({ blame }) => blame === "implied")
			.map(({ id }) => id),
	);
	const rows: TagGap[] = [];
	for (const row of run.rows) {
		const tags = row.fields.tags?.candidates ?? [];
		const picks = tags.map(({ id }) => {
			const answer = row.answers[`tags_${id}`] ?? {};
			const sorted = Object.entries(answer).sort((a, b) => b[1] - a[1]);
			const [first, second] = sorted;
			// A tie picks nothing, as the card reads it.
			const label = first && first[1] !== second?.[1] ? first[0] : "tie";
			return { id, label, p: first?.[1] ?? 0 };
		});
		if (picks.length === 0) continue;
		rows.push({
			id: row.id,
			request: row.request,
			picks: picks
				.map(({ id, label, p }) => `${id} ${label} ${p.toFixed(2)}`)
				.join(", "),
			// A named pair holds the tags whatever their picks, as fillGap reads it.
			gap:
				!row.pairs?.tags &&
				picks.every(
					({ id, label }) =>
						label === "not_mentioned" || (id === OFFICE && label === "yes"),
				),
			filled: falseFills.has(row.id),
		});
	}
	return {
		rows,
		gaps: rows.filter(({ gap }) => gap).length,
		filled: rows.filter(({ filled }) => filled).length,
	};
}
