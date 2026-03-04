import { StatusBarService } from "../../../src/services/StatusBarService";
import { TaskFactory } from "../../helpers/mock-factories";

jest.mock("obsidian", () => {
	return {
		TFile: class TFile {
			path: string;
			constructor(path: string) {
				this.path = path;
			}
		},
		setTooltip: jest.fn((el: HTMLElement, text: string) => {
			el.setAttribute("data-tooltip", text);
		}),
	};
});

jest.mock("../../../src/modals/TaskSelectorWithCreateModal", () => ({
	openTaskSelector: jest.fn(),
}));

/**
 * Create a mock plugin with the needed shape for StatusBarService.
 * `addStatusBarItem` returns a real DOM element so we can query it.
 */
function createMockPlugin(settingsOverrides: Record<string, any> = {}, tasks: any[] = []) {
	const statusBarItems: HTMLElement[] = [];

	const plugin: any = {
		app: {
			vault: {
				getAbstractFileByPath: jest.fn(),
			},
			workspace: {
				getLeaf: jest.fn(() => ({
					openFile: jest.fn(),
					setViewState: jest.fn(),
				})),
				revealLeaf: jest.fn(),
				getLeavesOfType: jest.fn(() => []),
			},
		},
		settings: {
			showTrackedTasksInStatusBar: true,
			showTotalTimeToday: false,
			...settingsOverrides,
		},
		addStatusBarItem: jest.fn(() => {
			const el = document.createElement("div");
			statusBarItems.push(el);
			return el;
		}),
		cacheManager: {
			getAllTasks: jest.fn(async () => tasks),
		},
		getActiveTimeSession: jest.fn(() => null),
		emitter: {
			on: jest.fn(),
			off: jest.fn(),
			trigger: jest.fn(),
		},
		formatTime: jest.fn((minutes: number) => {
			if (!minutes || minutes === 0) return "0m";
			const h = Math.floor(minutes / 60);
			const m = minutes % 60;
			if (h === 0) return `${m}m`;
			if (m === 0) return `${h}h`;
			return `${h}h ${m}m`;
		}),
		statusManager: {
			isCompletedStatus: jest.fn((s: string) => s === "done"),
		},
	};

	return { plugin, statusBarItems };
}

/**
 * Helper: create a time entry starting at a specific hour today.
 */
function todayEntry(startHour: number, durationMinutes: number): any {
	const today = new Date();
	const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startHour, 0, 0);
	const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
	return {
		startTime: start.toISOString(),
		endTime: end.toISOString(),
		description: `Session at ${startHour}:00`,
	};
}

function yesterdayEntry(startHour: number, durationMinutes: number): any {
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), startHour, 0, 0);
	const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
	return {
		startTime: start.toISOString(),
		endTime: end.toISOString(),
		description: `Yesterday session`,
	};
}

describe("StatusBarService — Total Time Today", () => {
	beforeEach(() => {
		jest.useFakeTimers({ now: new Date() });
		jest.clearAllMocks();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("creates a second status bar element when setting is enabled", () => {
		const { plugin, statusBarItems } = createMockPlugin({
			showTrackedTasksInStatusBar: true,
			showTotalTimeToday: true,
		});

		const service = new StatusBarService(plugin);
		service.initialize();

		// One for tracked tasks + one for total time today
		expect(plugin.addStatusBarItem).toHaveBeenCalledTimes(2);
		expect(statusBarItems).toHaveLength(2);
	});

	it('displays "Today: 2h 15m" summing today\'s entries across tasks', async () => {
		const tasks = [
			TaskFactory.createTask({
				title: "Task A",
				timeEntries: [
					todayEntry(9, 60), // 1h
					todayEntry(14, 45), // 45m
				],
			}),
			TaskFactory.createTask({
				title: "Task B",
				timeEntries: [
					todayEntry(10, 30), // 30m
				],
			}),
		];

		const { plugin, statusBarItems } = createMockPlugin(
			{ showTrackedTasksInStatusBar: true, showTotalTimeToday: true },
			tasks
		);

		const service = new StatusBarService(plugin);
		service.initialize();

		// Wait for async update
		await jest.advanceTimersByTimeAsync(150);

		const totalTimeEl = statusBarItems[1];
		expect(totalTimeEl.textContent).toContain("Today:");
		expect(totalTimeEl.textContent).toContain("2h 15m");
	});

	it("updates on requestUpdate (EVENT_TASK_UPDATED trigger)", async () => {
		const tasks = [
			TaskFactory.createTask({
				title: "Task A",
				timeEntries: [todayEntry(9, 30)],
			}),
		];

		const { plugin, statusBarItems } = createMockPlugin(
			{ showTrackedTasksInStatusBar: true, showTotalTimeToday: true },
			tasks
		);

		const service = new StatusBarService(plugin);
		service.initialize();
		await jest.advanceTimersByTimeAsync(150);

		const totalTimeEl = statusBarItems[1];
		expect(totalTimeEl.textContent).toContain("30m");

		// Simulate task updated — add more time
		plugin.cacheManager.getAllTasks.mockResolvedValue([
			TaskFactory.createTask({
				title: "Task A",
				timeEntries: [todayEntry(9, 30), todayEntry(14, 60)],
			}),
		]);

		service.requestUpdate();
		await jest.advanceTimersByTimeAsync(150);

		expect(totalTimeEl.textContent).toContain("1h 30m");
	});

	it("only counts entries with startTime today (local timezone)", async () => {
		const tasks = [
			TaskFactory.createTask({
				title: "Mixed task",
				timeEntries: [
					yesterdayEntry(22, 60), // Yesterday — should be excluded
					todayEntry(9, 45), // Today — should be included
				],
			}),
		];

		const { plugin, statusBarItems } = createMockPlugin(
			{ showTrackedTasksInStatusBar: true, showTotalTimeToday: true },
			tasks
		);

		const service = new StatusBarService(plugin);
		service.initialize();
		await jest.advanceTimersByTimeAsync(150);

		const totalTimeEl = statusBarItems[1];
		expect(totalTimeEl.textContent).toContain("45m");
		expect(totalTimeEl.textContent).not.toContain("1h");
	});

	it("includes active (running) sessions in today's total", async () => {
		const now = new Date();
		const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);

		const tasks = [
			TaskFactory.createTask({
				title: "Active task",
				timeEntries: [
					{
						startTime: thirtyMinsAgo.toISOString(),
						// No endTime — active session
						description: "Active",
					},
				],
			}),
		];

		const { plugin, statusBarItems } = createMockPlugin(
			{ showTrackedTasksInStatusBar: true, showTotalTimeToday: true },
			tasks
		);

		const service = new StatusBarService(plugin);
		service.initialize();
		await jest.advanceTimersByTimeAsync(150);

		const totalTimeEl = statusBarItems[1];
		expect(totalTimeEl.textContent).toContain("30m");
	});

	it("is hidden when setting is disabled", () => {
		const { plugin, statusBarItems } = createMockPlugin({
			showTrackedTasksInStatusBar: true,
			showTotalTimeToday: false,
		});

		const service = new StatusBarService(plugin);
		service.initialize();

		// Only one status bar item (the tracked tasks one)
		expect(statusBarItems).toHaveLength(1);
	});

	it("debounces updates (100ms)", async () => {
		const tasks = [
			TaskFactory.createTask({
				title: "Task A",
				timeEntries: [todayEntry(9, 30)],
			}),
		];

		const { plugin } = createMockPlugin(
			{ showTrackedTasksInStatusBar: true, showTotalTimeToday: true },
			tasks
		);

		const service = new StatusBarService(plugin);
		service.initialize();

		// Multiple rapid requestUpdate calls
		service.requestUpdate();
		service.requestUpdate();
		service.requestUpdate();

		// Only initial call + 1 debounced call should result in getAllTasks being called
		// (not 3 extra calls)
		await jest.advanceTimersByTimeAsync(150);

		// getAllTasks is called once during initialize, once for tracked tasks bar,
		// and once more from the debounced update. Not 3+ extra times.
		const callCount = plugin.cacheManager.getAllTasks.mock.calls.length;
		expect(callCount).toBeLessThanOrEqual(4);
	});
});
