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

/**
 * A run's gates with some set to other values, for rescoring. A gate for a
 * field the run does not have throws, so a misspelled field cannot rescore
 * the run at the gates it was run under and look like it changed nothing.
 */
export function overrideGates(
	gates: Record<string, number>,
	overrides: Record<string, number>,
): Record<string, number> {
	for (const name of Object.keys(overrides)) {
		if (!Object.hasOwn(gates, name)) {
			throw new TypeError(
				`justask: the run has no field "${name}" to set a gate for; its gates are ${Object.keys(gates).join(", ")}`,
			);
		}
	}
	return { ...gates, ...overrides };
}
