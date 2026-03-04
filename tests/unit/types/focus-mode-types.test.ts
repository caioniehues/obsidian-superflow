/**
 * Type-level and runtime tests for FocusMode types (Phase 2).
 *
 * These tests verify:
 * - FocusMode union type accepts exactly 'pomodoro' | 'flowtime' | 'countdown'
 * - FocusSession extends PomodoroSession with a mode field
 * - FocusState extends PomodoroState with a mode field
 * - Backward compatibility: PomodoroSession + mode: 'pomodoro' satisfies FocusSession
 * - FlowtimeBreakSuggestion shape
 */

import type {
	FocusMode,
	FocusSession,
	FocusState,
	FlowtimeBreakSuggestion,
	PomodoroSession,
	PomodoroState,
} from "../../../src/types";

describe("FocusMode types", () => {
	describe("FocusMode union type", () => {
		it("accepts 'pomodoro', 'flowtime', and 'countdown'", () => {
			const modes: FocusMode[] = ["pomodoro", "flowtime", "countdown"];
			expect(modes).toHaveLength(3);
			expect(modes).toContain("pomodoro");
			expect(modes).toContain("flowtime");
			expect(modes).toContain("countdown");
		});

		it("each mode value is a valid FocusMode", () => {
			const pomodoro: FocusMode = "pomodoro";
			const flowtime: FocusMode = "flowtime";
			const countdown: FocusMode = "countdown";
			expect(pomodoro).toBe("pomodoro");
			expect(flowtime).toBe("flowtime");
			expect(countdown).toBe("countdown");
		});
	});

	describe("FocusSession extends PomodoroSession", () => {
		const basePomodoroSession: PomodoroSession = {
			id: "test-1",
			startTime: "2026-01-01T00:00:00Z",
			plannedDuration: 25,
			type: "work",
			completed: false,
			activePeriods: [{ startTime: "2026-01-01T00:00:00Z" }],
		};

		it("includes all PomodoroSession fields plus mode", () => {
			const session: FocusSession = {
				...basePomodoroSession,
				mode: "pomodoro",
			};

			expect(session.id).toBe("test-1");
			expect(session.startTime).toBe("2026-01-01T00:00:00Z");
			expect(session.plannedDuration).toBe(25);
			expect(session.type).toBe("work");
			expect(session.completed).toBe(false);
			expect(session.activePeriods).toHaveLength(1);
			expect(session.mode).toBe("pomodoro");
		});

		it("backward compat: PomodoroSession + mode satisfies FocusSession", () => {
			// This is the key backward-compatibility check: spreading a PomodoroSession
			// and adding mode: 'pomodoro' should produce a valid FocusSession.
			const focusSession: FocusSession = {
				...basePomodoroSession,
				mode: "pomodoro",
			};
			expect(focusSession.mode).toBe("pomodoro");
			expect(focusSession.id).toBe(basePomodoroSession.id);
			expect(focusSession.plannedDuration).toBe(basePomodoroSession.plannedDuration);
		});

		it("supports optional taskPath", () => {
			const session: FocusSession = {
				...basePomodoroSession,
				taskPath: "tasks/my-task.md",
				mode: "flowtime",
			};
			expect(session.taskPath).toBe("tasks/my-task.md");
		});
	});

	describe("FocusState extends PomodoroState", () => {
		it("includes all PomodoroState fields plus mode", () => {
			const state: FocusState = {
				isRunning: true,
				timeRemaining: 1500,
				mode: "countdown",
			};
			expect(state.isRunning).toBe(true);
			expect(state.timeRemaining).toBe(1500);
			expect(state.mode).toBe("countdown");
		});

		it("supports optional currentSession and nextSessionType", () => {
			const state: FocusState = {
				isRunning: false,
				timeRemaining: 0,
				nextSessionType: "work",
				mode: "pomodoro",
			};
			expect(state.nextSessionType).toBe("work");
			expect(state.currentSession).toBeUndefined();
		});
	});

	describe("FlowtimeBreakSuggestion", () => {
		it("has suggestedBreakMinutes and workDurationMinutes", () => {
			const suggestion: FlowtimeBreakSuggestion = {
				suggestedBreakMinutes: 5,
				workDurationMinutes: 20,
			};
			expect(suggestion.suggestedBreakMinutes).toBe(5);
			expect(suggestion.workDurationMinutes).toBe(20);
		});
	});
});
