/**
 * Countdown timer utilities.
 *
 * Countdown mode is a simple "work for X minutes" timer — no break cycles,
 * no session rotation. Just a single work session with a fixed duration.
 */

import { FocusSession } from "../types";

export function createCountdownSession(durationMinutes: number, taskPath?: string): FocusSession {
	const clampedDuration = Math.min(480, Math.max(1, durationMinutes));
	const now = new Date().toISOString();
	return {
		id: Date.now().toString(36) + Math.random().toString(36).substring(2, 11),
		taskPath,
		startTime: now,
		plannedDuration: clampedDuration,
		type: "work",
		completed: false,
		activePeriods: [{ startTime: now }],
		mode: "countdown",
	};
}

export function isCountdownComplete(session: FocusSession, elapsedSeconds: number): boolean {
	return elapsedSeconds >= session.plannedDuration * 60;
}
