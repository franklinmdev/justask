import { describe, expect, it } from "vitest";
import { fixGate, poolFields } from "../demo/eval/gates.ts";

describe("the gate rule", () => {
	it.each([
		["the midpoint, rounded to 0.05", 0.9, 0.4, 0.65],
		["no wrong pick: the lowest right one, rounded down", 0.87, null, 0.85],
		["no wrong pick: never above 0.9", 0.99, null, 0.9],
		["overlap: the first 0.05 above the highest wrong", 0.6, 0.72, 0.75],
		["a wrong pick on a step: the next step up", 0.6, 0.7, 0.75],
		["a midpoint that rounds onto a wrong pick: above it", 0.74, 0.71, 0.75],
	])("sets %s", (_, lowestRight, highestWrong, gate) => {
		expect(fixGate({ lowestRight, highestWrong })).toBe(gate);
	});

	it("leaves the gate to the owner when no right pick or no gate fits", () => {
		expect(() => fixGate({ lowestRight: null, highestWrong: 0.4 })).toThrow(
			/no right pick/,
		);
		expect(() => fixGate({ lowestRight: 0.5, highestWrong: 0.97 })).toThrow(
			/the owner decides/,
		);
		expect(() => fixGate({ lowestRight: 0.03, highestWrong: null })).toThrow(
			/the owner decides/,
		);
	});

	it("pools both languages: the lowest right pick and the highest wrong one", () => {
		const field = (
			lowestRight: number | null,
			highestWrong: number | null,
		) => ({
			lowestRight,
			highestWrong,
		});

		expect(
			poolFields([
				{ fields: { vendor: field(0.8, 0.3), status: field(0.9, null) } },
				{ fields: { vendor: field(0.7, 0.2), status: field(null, 0.4) } },
			]),
		).toEqual({
			vendor: { lowestRight: 0.7, highestWrong: 0.3 },
			status: { lowestRight: 0.9, highestWrong: 0.4 },
		});
	});
});
