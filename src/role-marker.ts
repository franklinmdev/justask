/**
 * Text that speaks as the system, an admin or the request's own wrapper,
 * rather than as the person: a role label opening the request or a sentence
 * ("System:", "Instrucción del sistema:"), a role in brackets ("[admin]"), a
 * request tag ("</request>"), or an order to ignore the instructions. English
 * and Spanish, as the built-in parser reads. A narrow heuristic that holds the
 * obvious cases, not a defence against injection (ADR 0015).
 */
const MARKERS: RegExp[] = [
	// A role label where a speaker's turn starts: the request, a line or a sentence.
	/(?:^|(?<=[\n.!?:;\]>"“]\s*))(?:(?:instrucci[oó]n(?:es)?|mensaje|indicaci[oó]n(?:es)?)\s+del\s+)?(?:system|sistema|assistant|asistente)(?:\s+(?:prompt|instructions?|message))?\s*:/iu,
	/\[\s*(?:admin|administrador|system|sistema|assistant|asistente)\s*\]/iu,
	/<\s*\/?\s*(?:request|system|instructions?|solicitud|sistema|instrucciones)\s*>/iu,
	/(?<![\p{L}\p{N}])ignore\s+(?:all\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|earlier)\s+instructions(?![\p{L}\p{N}])/iu,
	/(?<![\p{L}\p{N}])ignor(?:a|e|ar|en)\s+(?:todas\s+)?las\s+instrucciones(?![\p{L}\p{N}])/iu,
];

/** The first role marker the request holds, as it writes it, in NFC. */
export function findRoleMarker(request: string): string | undefined {
	const text = request.normalize("NFC");
	let first: RegExpExecArray | undefined;
	for (const marker of MARKERS) {
		const found = marker.exec(text);
		if (found && (!first || found.index < first.index)) first = found;
	}
	return first?.[0].trim();
}
