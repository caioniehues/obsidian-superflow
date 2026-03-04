/**
 * Tests for flowtime break suggestion logic.
 *
 * The flowtime technique suggests break durations based on how long you worked:
 * - Short work (<25 min) → 5 min break
 * - Medium work (25–49 min) → 8 min break
 * - Long work (50–89 min) → 10 min break
 * - Very long work (≥90 min) → 15 min break
 */

import { suggestFlowtimeBreak } from "../../../src/utils/flowtimeUtils";

describe("suggestFlowtimeBreak", () => {
	describe("break duration tiers", () => {
		it("suggests 5 min break for <25 min work", () => {
			const result = suggestFlowtimeBreak(10);
			expect(result.suggestedBreakMinutes).toBe(5);
			expect(result.workDurationMinutes).toBe(10);
		});

		it("suggests 8 min break for 25–49 min work", () => {
			const result = suggestFlowtimeBreak(30);
			expect(result.suggestedBreakMinutes).toBe(8);
			expect(result.workDurationMinutes).toBe(30);
		});

		it("suggests 10 min break for 50–89 min work", () => {
			const result = suggestFlowtimeBreak(60);
			expect(result.suggestedBreakMinutes).toBe(10);
			expect(result.workDurationMinutes).toBe(60);
		});

		it("suggests 15 min break for ≥90 min work", () => {
			const result = suggestFlowtimeBreak(120);
			expect(result.suggestedBreakMinutes).toBe(15);
			expect(result.workDurationMinutes).toBe(120);
		});
	});

	describe("boundary values", () => {
		it("exactly 25 min → 8 min break (lower boundary of second tier)", () => {
			expect(suggestFlowtimeBreak(25).suggestedBreakMinutes).toBe(8);
		});

		it("exactly 50 min → 10 min break (lower boundary of third tier)", () => {
			expect(suggestFlowtimeBreak(50).suggestedBreakMinutes).toBe(10);
		});

		it("exactly 90 min → 15 min break (lower boundary of fourth tier)", () => {
			expect(suggestFlowtimeBreak(90).suggestedBreakMinutes).toBe(15);
		});

		it("24.99 min → 5 min break (upper edge of first tier)", () => {
			expect(suggestFlowtimeBreak(24.99).suggestedBreakMinutes).toBe(5);
		});

		it("49.99 min → 8 min break (upper edge of second tier)", () => {
			expect(suggestFlowtimeBreak(49.99).suggestedBreakMinutes).toBe(8);
		});

		it("89.99 min → 10 min break (upper edge of third tier)", () => {
			expect(suggestFlowtimeBreak(89.99).suggestedBreakMinutes).toBe(10);
		});
	});

	describe("edge cases", () => {
		it("0 min work → 5 min break", () => {
			const result = suggestFlowtimeBreak(0);
			expect(result.suggestedBreakMinutes).toBe(5);
			expect(result.workDurationMinutes).toBe(0);
		});

		it("negative input is clamped to 0", () => {
			const result = suggestFlowtimeBreak(-10);
			expect(result.suggestedBreakMinutes).toBe(5);
			expect(result.workDurationMinutes).toBe(0);
		});
	});
});
