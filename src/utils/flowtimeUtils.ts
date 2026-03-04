/**
 * Flowtime break suggestion logic.
 *
 * Based on the Flowtime Technique: work without a fixed timer, then take
 * a break proportional to how long you worked.
 */

import { FlowtimeBreakSuggestion } from "../types";

export function suggestFlowtimeBreak(workDurationMinutes: number): FlowtimeBreakSuggestion {
	const clamped = Math.max(0, workDurationMinutes);
	let suggestedBreakMinutes: number;

	if (clamped < 25) {
		suggestedBreakMinutes = 5;
	} else if (clamped < 50) {
		suggestedBreakMinutes = 8;
	} else if (clamped < 90) {
		suggestedBreakMinutes = 10;
	} else {
		suggestedBreakMinutes = 15;
	}

	return { suggestedBreakMinutes, workDurationMinutes: clamped };
}
