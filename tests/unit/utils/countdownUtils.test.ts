/**
 * Tests for countdown timer utilities.
 *
 * Countdown mode is a simple "work for X minutes" timer with no break cycles.
 * It creates FocusSessions with mode: 'countdown' and type: 'work'.
 */

import { createCountdownSession, isCountdownComplete } from "../../../src/utils/countdownUtils";

describe("createCountdownSession", () => {
	it("creates a valid FocusSession with mode 'countdown' and type 'work'", () => {
		const session = createCountdownSession(45);
		expect(session.mode).toBe("countdown");
		expect(session.type).toBe("work");
		expect(session.plannedDuration).toBe(45);
		expect(session.completed).toBe(false);
		expect(session.id).toBeDefined();
		expect(session.startTime).toBeDefined();
		expect(session.activePeriods).toHaveLength(1);
		expect(session.activePeriods[0].startTime).toBeDefined();
	});

	it("stores optional taskPath", () => {
		const session = createCountdownSession(30, "tasks/my-task.md");
		expect(session.taskPath).toBe("tasks/my-task.md");
	});

	it("taskPath is undefined when not provided", () => {
		const session = createCountdownSession(30);
		expect(session.taskPath).toBeUndefined();
	});

	describe("duration clamping (1–480 min)", () => {
		it("clamps duration below 1 to 1", () => {
			expect(createCountdownSession(0).plannedDuration).toBe(1);
			expect(createCountdownSession(-5).plannedDuration).toBe(1);
		});

		it("clamps duration above 480 to 480", () => {
			expect(createCountdownSession(500).plannedDuration).toBe(480);
			expect(createCountdownSession(9999).plannedDuration).toBe(480);
		});

		it("allows valid durations within range", () => {
			expect(createCountdownSession(1).plannedDuration).toBe(1);
			expect(createCountdownSession(480).plannedDuration).toBe(480);
			expect(createCountdownSession(60).plannedDuration).toBe(60);
		});
	});

	it("always sets type to 'work' (no break sessions)", () => {
		// Countdown mode never produces break sessions
		const session = createCountdownSession(25);
		expect(session.type).toBe("work");
	});
});

describe("isCountdownComplete", () => {
	it("returns true when elapsed >= planned duration in seconds", () => {
		const session = createCountdownSession(25); // 25 min = 1500 sec
		expect(isCountdownComplete(session, 1500)).toBe(true);
		expect(isCountdownComplete(session, 1501)).toBe(true);
	});

	it("returns false when elapsed < planned duration", () => {
		const session = createCountdownSession(25);
		expect(isCountdownComplete(session, 1499)).toBe(false);
		expect(isCountdownComplete(session, 0)).toBe(false);
	});

	it("no nextSessionType concept — countdown has no follow-up session", () => {
		// Countdown sessions are standalone; there's no break/next cycle.
		// The session object should not dictate a next session type.
		const session = createCountdownSession(10);
		// FocusSession inherits from PomodoroSession which has no nextSessionType field
		expect((session as any).nextSessionType).toBeUndefined();
	});
});
