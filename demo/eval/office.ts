import type { CardRun } from "justask/eval";
import { english } from "../src/content/en.ts";
import { spanish } from "../src/content/es.ts";
import type { Content, Language } from "../src/content/types.ts";

const OFFICE = "office";
const QUESTION = `tags_${OFFICE}`;

const served = (content: Content) => {
	const label = content.tags.find(({ id }) => id === OFFICE)?.description;
	if (label === undefined) throw new Error("the demo serves no office tag");
	return label;
};

/**
 * #77's office labels, each changing one thing from the one the demo serves
 * (`current`): `backups` names backups among the services, `short` keeps the
 * label's head and drops its list. The probe runs measure them; the demo
 * serves `current` alone.
 */
export const OFFICE_LABELS: Record<Language, Record<string, string>> = {
	en: {
		current: served(english),
		backups:
			"office: what keeps the business running, such as supplies, equipment, software, hosting, backups, repairs, cleaning and window washing, printing, couriers, payroll and HR, legal advice and insurance",
		short: "office: what keeps the business running",
	},
	es: {
		current: served(spanish),
		backups:
			"oficina: lo que mantiene el negocio en marcha, como artículos, equipos, software, hosting, respaldos, reparaciones, limpieza y ventanas, imprenta, mensajería, nómina y recursos humanos, asesoría legal y seguros",
		short: "oficina: lo que mantiene el negocio en marcha",
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
	p: number;
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
		const [pick, p] = Object.entries(answer).reduce((best, next) =>
			next[1] > best[1] ? next : best,
		);
		rows.push({
			id: row.id,
			request: row.request,
			pick,
			p,
			newRecord: row.answers.intent?.new_record,
		});
	}
	const won: Record<string, number> = {};
	for (const { pick } of rows) won[pick] = (won[pick] ?? 0) + 1;
	return {
		asked: rows.length,
		yes: rows.filter(({ pick, p }) => pick === "yes" && p >= gate).length,
		won,
		rows,
	};
}
