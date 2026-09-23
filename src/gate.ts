/**
 * Throws unless the gate is a finite number strictly between 0 and 1. Any
 * other gate would hold a field, or fill it, whatever the provider picked.
 */
export function checkGate(gate: number, what: string): void {
	if (!(gate > 0 && gate < 1)) {
		throw new TypeError(
			`justask: ${what} must be a number strictly between 0 and 1, not ${gate}`,
		);
	}
}
