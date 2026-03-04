/**
 * Tests for P0.3 — StateWriterService
 *
 * StateWriterService writes a JSON snapshot of plugin state to
 * ~/.config/superflow/state.json so external tools (tray app, CLI)
 * can read current focus/task state.
 */

import { StateWriterService } from "../../../src/services/StateWriterService";
import type { TaskInfo, PomodoroState, SuperFlowState } from "../../../src/types";

// Mock Node.js fs
jest.mock("fs", () => ({
	promises: {
		writeFile: jest.fn().mockResolvedValue(undefined),
		rename: jest.fn().mockResolvedValue(undefined),
		mkdir: jest.fn().mockResolvedValue(undefined),
	},
	existsSync: jest.fn().mockReturnValue(true),
}));

import * as fs from "fs";

// Helper: create a minimal mock plugin
function createMockPlugin(overrides?: {
	trackedTask?: TaskInfo | null;
	pomodoroState?: Partial<PomodoroState>;
	allTasks?: TaskInfo[];
	stateFilePath?: string;
}) {
	const eventListeners = new Map<string, Function>();

	// If trackedTask is provided but not in allTasks, add it
	// The implementation finds tracked tasks via getActiveTimeEntry on allTasks
	let resolvedAllTasks = overrides?.allTasks ?? [];
	if (overrides?.trackedTask && !resolvedAllTasks.includes(overrides.trackedTask)) {
		resolvedAllTasks = [overrides.trackedTask, ...resolvedAllTasks];
	}

	return {
		settings: {
			superflowStateFilePath:
				overrides?.stateFilePath ??
				require("path").join(require("os").homedir(), ".config/superflow/state.json"),
		},
		pomodoroService: {
			getState: jest.fn().mockReturnValue({
				isRunning: false,
				timeRemaining: 0,
				currentSession: undefined,
				...overrides?.pomodoroState,
			} as PomodoroState),
		},
		cacheManager: {
			getAllTasks: jest.fn().mockResolvedValue(resolvedAllTasks),
		},
		emitter: {
			on: jest.fn((event: string, cb: Function) => {
				eventListeners.set(event, cb);
				return { id: event }; // mock EventRef
			}),
			offref: jest.fn(),
		},
		// expose for test inspection
		_eventListeners: eventListeners,
	};
}

function createTask(overrides?: Partial<TaskInfo>): TaskInfo {
	return {
		title: "Test Task",
		status: "open",
		priority: "normal",
		path: "/tasks/test-task.md",
		archived: false,
		tags: ["task"],
		...overrides,
	};
}

describe("P0.3 — StateWriterService", () => {
	let service: StateWriterService;
	let mockPlugin: ReturnType<typeof createMockPlugin>;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		mockPlugin = createMockPlugin();
		service = new StateWriterService(mockPlugin as any);
	});

	afterEach(() => {
		service.destroy();
		jest.useRealTimers();
	});

	describe("buildStateSnapshot()", () => {
		it("produces JSON with version, timestamp, currentTask, timer, todayTasks, settings", async () => {
			const snapshot = await service.buildStateSnapshot();

			expect(snapshot).toHaveProperty("version", 1);
			expect(snapshot).toHaveProperty("timestamp");
			expect(snapshot).toHaveProperty("currentTask");
			expect(snapshot).toHaveProperty("timer");
			expect(snapshot).toHaveProperty("todayTasks");
			expect(snapshot).toHaveProperty("settings");
		});

		it("timer.progress = elapsed / duration, clamped 0–1", async () => {
			// 25-minute session, 15 minutes remaining => 10 min elapsed
			// progress = 10/25 = 0.4
			const plugin = createMockPlugin({
				pomodoroState: {
					isRunning: true,
					timeRemaining: 15 * 60, // 15 min in seconds
					currentSession: {
						id: "sess-1",
						startTime: new Date().toISOString(),
						plannedDuration: 25, // minutes
						type: "work",
						completed: false,
						activePeriods: [],
					},
				},
			});
			const svc = new StateWriterService(plugin as any);
			const snapshot = await svc.buildStateSnapshot();

			expect(snapshot.timer.progress).toBeCloseTo(0.4, 1);
			expect(snapshot.timer.progress).toBeGreaterThanOrEqual(0);
			expect(snapshot.timer.progress).toBeLessThanOrEqual(1);
			svc.destroy();
		});

		it("progress is clamped to 0 when no session", async () => {
			const snapshot = await service.buildStateSnapshot();
			expect(snapshot.timer.progress).toBe(0);
		});

		it("no tracked task → currentTask: null", async () => {
			const snapshot = await service.buildStateSnapshot();
			expect(snapshot.currentTask).toBeNull();
		});

		it("tracked task → currentTask populated with correct fields", async () => {
			const task = createTask({
				title: "My Task",
				path: "/tasks/my-task.md",
				status: "in-progress",
				timeEstimate: 60, // 60 minutes
				projects: ["project-a"],
				timeEntries: [
					{
						startTime: "2026-02-28T08:00:00Z",
						endTime: "2026-02-28T09:00:00Z",
					},
					// Active entry (no endTime) - makes task "tracked"
					{
						startTime: new Date().toISOString(),
					},
				],
			});
			const plugin = createMockPlugin({ trackedTask: task });
			const svc = new StateWriterService(plugin as any);
			const snapshot = await svc.buildStateSnapshot();

			expect(snapshot.currentTask).not.toBeNull();
			expect(snapshot.currentTask!.path).toBe("/tasks/my-task.md");
			expect(snapshot.currentTask!.title).toBe("My Task");
			expect(snapshot.currentTask!.timeEstimate).toBe(60 * 60 * 1000); // minutes → ms
			expect(snapshot.currentTask!.status).toBe("in-progress");
			expect(snapshot.currentTask!.project).toBe("project-a");
			svc.destroy();
		});

		it("timeEstimate converted from minutes to ms in output", async () => {
			// Task needs an active time entry (no endTime) to be detected as tracked
			const task = createTask({
				timeEstimate: 120,
				timeEntries: [{ startTime: new Date().toISOString() }],
			});
			const plugin = createMockPlugin({ trackedTask: task });
			const svc = new StateWriterService(plugin as any);
			const snapshot = await svc.buildStateSnapshot();

			expect(snapshot.currentTask!.timeEstimate).toBe(120 * 60 * 1000);
			svc.destroy();
		});

		it("active time entries (no endTime) contribute to totalTrackedTime", async () => {
			const now = Date.now();
			const thirtyMinAgo = new Date(now - 30 * 60 * 1000).toISOString();
			const task = createTask({
				timeEntries: [
					// Completed entry: 1 hour
					{
						startTime: "2026-02-28T08:00:00Z",
						endTime: "2026-02-28T09:00:00Z",
					},
					// Active entry: ~30 min (no endTime)
					{
						startTime: thirtyMinAgo,
					},
				],
			});
			const plugin = createMockPlugin({ trackedTask: task });
			const svc = new StateWriterService(plugin as any);
			const snapshot = await svc.buildStateSnapshot();

			// Completed: 3600000ms + Active: ~1800000ms = ~5400000ms
			// Allow some tolerance for test execution time
			expect(snapshot.currentTask!.totalTrackedTime).toBeGreaterThanOrEqual(
				5400000 - 5000
			);
			expect(snapshot.currentTask!.totalTrackedTime).toBeLessThanOrEqual(
				5400000 + 5000
			);
			svc.destroy();
		});

		it("todayTasks filters by scheduled === today", async () => {
			const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
			const tasks = [
				createTask({ title: "Today Task", path: "/t1.md", scheduled: today }),
				createTask({
					title: "Tomorrow Task",
					path: "/t2.md",
					scheduled: "2099-12-31",
				}),
				createTask({
					title: "No Schedule",
					path: "/t3.md",
					scheduled: undefined,
				}),
			];
			const plugin = createMockPlugin({ allTasks: tasks });
			const svc = new StateWriterService(plugin as any);
			const snapshot = await svc.buildStateSnapshot();

			expect(snapshot.todayTasks).toHaveLength(1);
			expect(snapshot.todayTasks[0].title).toBe("Today Task");
			svc.destroy();
		});
	});

	describe("Atomic write pattern", () => {
		it("writes to .tmp then renames", async () => {
			const plugin = createMockPlugin();
			const svc = new StateWriterService(plugin as any);
			await svc.init();

			// Trigger a write
			await svc.writeStateNow();

			const expectedPath = plugin.settings.superflowStateFilePath;
			const tmpPath = expectedPath + ".tmp";

			expect(fs.promises.mkdir).toHaveBeenCalled();
			expect(fs.promises.writeFile).toHaveBeenCalledWith(
				tmpPath,
				expect.any(String),
				"utf-8"
			);
			expect(fs.promises.rename).toHaveBeenCalledWith(tmpPath, expectedPath);
			svc.destroy();
		});
	});

	describe("Debouncing", () => {
		it("multiple calls result in a single write", async () => {
			const plugin = createMockPlugin();
			const svc = new StateWriterService(plugin as any);
			await svc.init();

			// Request multiple writes quickly
			svc.requestWrite();
			svc.requestWrite();
			svc.requestWrite();

			// No write yet — debounced
			expect(fs.promises.writeFile).not.toHaveBeenCalled();

			// Advance past debounce window
			jest.advanceTimersByTime(350);

			// Let async chain settle (writeStateNow has multiple awaits)
			for (let i = 0; i < 10; i++) {
				await Promise.resolve();
			}

			expect(fs.promises.writeFile).toHaveBeenCalledTimes(1);
			svc.destroy();
		});
	});

	describe("Event subscription and destroy()", () => {
		it("init() subscribes to events", async () => {
			const plugin = createMockPlugin();
			const svc = new StateWriterService(plugin as any);
			await svc.init();

			expect(plugin.emitter.on).toHaveBeenCalledWith(
				"task-updated",
				expect.any(Function)
			);
			expect(plugin.emitter.on).toHaveBeenCalledWith(
				"pomodoro-tick",
				expect.any(Function)
			);
			expect(plugin.emitter.on).toHaveBeenCalledWith(
				"data-changed",
				expect.any(Function)
			);
			svc.destroy();
		});

		it("destroy() cleans up listeners", async () => {
			const plugin = createMockPlugin();
			const svc = new StateWriterService(plugin as any);
			await svc.init();

			svc.destroy();

			// offref should have been called for each registered listener
			expect(plugin.emitter.offref).toHaveBeenCalledTimes(3);
		});
	});

	describe("Default path", () => {
		it("defaults to ~/.config/superflow/state.json", () => {
			const os = require("os");
			const path = require("path");
			const expected = path.join(
				os.homedir(),
				".config/superflow/state.json"
			);
			const plugin = createMockPlugin();
			const svc = new StateWriterService(plugin as any);
			expect(svc.getStatePath()).toBe(expected);
			svc.destroy();
		});
	});
});
