import type { Language } from "./content/types.ts";

/** Each language's catalog is its own route, so each route owns its data. */
export function searchEndpoint(language: Language): string {
	return `/api/search/${language}`;
}

export function filterEndpoint(language: Language): string {
	return `/api/filter/${language}`;
}

export function cardEndpoint(language: Language): string {
	return `/api/card/${language}`;
}
