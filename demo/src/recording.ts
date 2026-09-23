import type {
	CardHandlerResponse,
	FilterHandlerResponse,
	SearchHandlerResponse,
	Usage,
} from "justask";
import formEn from "../recordings/form-en.json" with { type: "json" };
import formEs from "../recordings/form-es.json" with { type: "json" };
import searchEn from "../recordings/search-en.json" with { type: "json" };
import searchEs from "../recordings/search-es.json" with { type: "json" };
import tableEn from "../recordings/table-en.json" with { type: "json" };
import tableEs from "../recordings/table-es.json" with { type: "json" };
import type {
	ExpenseFields,
	Language,
	TransactionFields,
	Vendor,
} from "./content/types.ts";
import type { Trace } from "./trace.ts";

/**
 * One real call through the demo's handler, as demo/recordings/record.ts
 * wrote it: the frozen eval row its sentence comes from, when and in which
 * time zone it ran, the request, the handler's whole 200 body and the round
 * trip. Nothing in it is edited by hand.
 */
export type Recording<R extends Usage> = {
	/** The eval set's file and the row's id. */
	set: string;
	row: string;
	/** When the call was made, an ISO timestamp, and the time zone it sent. */
	recordedAt: string;
	timeZone: string;
	request: string;
	latencyMs: number;
	response: R;
};

export type TableRecording = Recording<
	FilterHandlerResponse<TransactionFields>
>;
export type SearchRecording = Recording<SearchHandlerResponse<Vendor>>;
export type FormRecording = Recording<CardHandlerResponse<ExpenseFields>>;

/** The recorded run each case opens on, per language. */
export type Recordings = {
	table: Record<Language, TableRecording>;
	search: Record<Language, SearchRecording>;
	form: Record<Language, FormRecording>;
};

export const recordings: Recordings = {
	table: {
		en: tableEn as TableRecording,
		es: tableEs as TableRecording,
	},
	search: {
		en: searchEn as SearchRecording,
		es: searchEs as SearchRecording,
	},
	form: {
		en: formEn as FormRecording,
		es: formEs as FormRecording,
	},
};

/** The recorded call as the hood shows a live one: its request, round trip and use. */
export function traceOf({
	request,
	latencyMs,
	response,
}: Recording<Usage>): Trace {
	return {
		request,
		ms: latencyMs,
		...(response.costUsd !== undefined && { costUsd: response.costUsd }),
		...(response.inputTokens !== undefined && {
			inputTokens: response.inputTokens,
		}),
	};
}

/** The calendar day the recording ran, in the time zone it sent. */
export function dayOf({ recordedAt, timeZone }: Recording<Usage>): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone }).format(
		new Date(recordedAt),
	);
}
