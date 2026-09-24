/** Lowercase, with accents and other combining marks dropped: "Año" reads "ano". */
export function fold(text: string): string {
	return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
