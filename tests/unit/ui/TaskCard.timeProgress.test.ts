import { createTaskCard, updateTaskCard } from "../../../src/ui/TaskCard";
import { TaskFactory, TimeEntryFactory } from "../../helpers/mock-factories";
import { App, MockObsidian } from "../../__mocks__/obsidian";

jest.mock("obsidian");

jest.mock("../../../src/utils/helpers", () => ({
	calculateTotalTimeSpent: jest.requireActual("../../../src/utils/helpers").calculateTotalTimeSpent,
	calculateDuration: jest.requireActual("../../../src/utils/helpers").calculateDuration,
	getActiveTimeEntry: jest.requireActual("../../../src/utils/helpers").getActiveTimeEntry,
	formatTime: jest.requireActual("../../../src/utils/helpers").formatTime,
	getEffectiveTaskStatus: jest.fn((task) => task.status || "open"),
	shouldUseRecurringTaskUI: jest.fn(() => false),
	getRecurringTaskCompletionText: jest.fn(() => "Not completed for this date"),
	getRecurrenceDisplayText: jest.fn(() => "Daily"),
	filterEmptyProjects: jest.fn((projects) => projects?.filter((p: string) => p && p.trim()) || []),
}));

jest.mock("../../../src/utils/dateUtils", () => ({
	isTodayTimeAware: jest.fn(() => false),
	isOverdueTimeAware: jest.fn(() => false),
	formatDateTimeForDisplay: jest.fn(() => "Jan 15"),
	getDatePart: jest.fn(() => ""),
	getTimePart: jest.fn(() => null),
	formatDateForStorage: jest.fn((value: Date | string) => {
		if (value instanceof Date) {
			return value.toISOString().split("T")[0];
		}
		return value?.split("T")[0] || "";
	}),
}));

jest.mock("../../../src/components/TaskContextMenu", () => ({
	TaskContextMenu: jest.fn().mockImplementation(() => ({
		show: jest.fn(),
	})),
}));

describe("TaskCard time progress bar", () => {
	let app: App;
	let plugin: any;

	beforeEach(() => {
		jest.clearAllMocks();
		MockObsidian.reset();

		app = new App();
		plugin = {
			app,
			fieldMapper: {
				lookupMappingKey: jest.fn((propertyId: string) => {
					const mapped = new Set(["status", "priority", "due", "scheduled", "contexts", "projects"]);
					return mapped.has(propertyId) ? propertyId : null;
				}),
				isPropertyForField: jest.fn((propertyId: string, field: string) => propertyId === field),
				toUserField: jest.fn((field: string) => field),
				getMapping: jest.fn(() => ({
					status: "status",
					priority: "priority",
					due: "due",
					scheduled: "scheduled",
					contexts: "contexts",
					projects: "projects",
				})),
			},
			statusManager: {
				isCompletedStatus: jest.fn((status: string) => status === "done"),
				getStatusConfig: jest.fn((status: string) => ({
					value: status,
					label: status,
					color: "#666666",
				})),
				getNextStatus: jest.fn(() => "done"),
				getCompletedStatuses: jest.fn(() => ["done"]),
			},
			priorityManager: {
				getPriorityConfig: jest.fn((priority: string) => ({
					value: priority,
					label: priority,
					color: "#ff0000",
				})),
			},
			getActiveTimeSession: jest.fn(() => null),
			cacheManager: {
				getTaskInfo: jest.fn(),
			},
			updateTaskProperty: jest.fn(),
			getTaskByPath: jest.fn(),
			projectSubtasksService: {
				isTaskUsedAsProject: jest.fn().mockResolvedValue(false),
				isTaskUsedAsProjectSync: jest.fn().mockReturnValue(false),
			},
			i18n: {
				translate: jest.fn((key: string) => key),
			},
			settings: {
				singleClickAction: "edit",
				doubleClickAction: "none",
				showExpandableSubtasks: true,
				subtaskChevronPosition: "right",
				hideCompletedFromOverdue: true,
				calendarViewSettings: {
					timeFormat: "24",
				},
			},
		};

		jest.spyOn(console, "error").mockImplementation(() => {});
		jest.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("renders progress bar at 50% when tracked time is half the estimate", () => {
		const now = new Date();
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

		const task = TaskFactory.createTask({
			timeEstimate: 120, // 2 hours = 120 minutes
			timeEntries: [
				{
					startTime: oneHourAgo.toISOString(),
					endTime: now.toISOString(),
					description: "Session 1",
				},
			],
			totalTrackedTime: 60, // 1 hour = 60 minutes
		});

		MockObsidian.createTestFile(task.path, "# Test");

		const card = createTaskCard(task, plugin, ["timeProgress"]);

		const progressEl = card.querySelector(".task-card__time-progress");
		expect(progressEl).not.toBeNull();

		const fill = card.querySelector(".task-card__time-progress-bar-fill") as HTMLElement;
		expect(fill).not.toBeNull();
		expect(fill.style.width).toBe("50%");
	});

	it("caps bar at 100% and adds --overtime modifier when tracked exceeds estimate", () => {
		const now = new Date();
		const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

		const task = TaskFactory.createTask({
			timeEstimate: 120, // 2 hours
			timeEntries: [
				{
					startTime: threeHoursAgo.toISOString(),
					endTime: now.toISOString(),
					description: "Long session",
				},
			],
			totalTrackedTime: 180, // 3 hours
		});

		MockObsidian.createTestFile(task.path, "# Test");

		const card = createTaskCard(task, plugin, ["timeProgress"]);

		const fill = card.querySelector(".task-card__time-progress-bar-fill") as HTMLElement;
		expect(fill.style.width).toBe("100%");

		const progressEl = card.querySelector(".task-card__time-progress");
		expect(progressEl?.classList.contains("task-card__time-progress--overtime")).toBe(true);
	});

	it("does not render bar when no timeEstimate is set", () => {
		const task = TaskFactory.createTask({
			timeEntries: [
				TimeEntryFactory.createEntry(),
			],
			totalTrackedTime: 30,
		});

		MockObsidian.createTestFile(task.path, "# Test");

		const card = createTaskCard(task, plugin, ["timeProgress"]);

		expect(card.querySelector(".task-card__time-progress")).toBeNull();
	});

	it("renders bar at 0% when timeEstimate is set but no time entries exist", () => {
		const task = TaskFactory.createTask({
			timeEstimate: 60, // 1 hour
			timeEntries: [],
			totalTrackedTime: 0,
		});

		MockObsidian.createTestFile(task.path, "# Test");

		const card = createTaskCard(task, plugin, ["timeProgress"]);

		const progressEl = card.querySelector(".task-card__time-progress");
		expect(progressEl).not.toBeNull();

		const fill = card.querySelector(".task-card__time-progress-bar-fill") as HTMLElement;
		expect(fill.style.width).toBe("0%");
	});

	it('shows label in "1h / 2h" format', () => {
		const now = new Date();
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

		const task = TaskFactory.createTask({
			timeEstimate: 120,
			timeEntries: [
				{
					startTime: oneHourAgo.toISOString(),
					endTime: now.toISOString(),
					description: "Session",
				},
			],
			totalTrackedTime: 60,
		});

		MockObsidian.createTestFile(task.path, "# Test");

		const card = createTaskCard(task, plugin, ["timeProgress"]);

		const label = card.querySelector(".task-card__time-progress-label");
		expect(label).not.toBeNull();
		expect(label?.textContent).toBe("1h / 2h");
	});

	it("shows exact percentage in tooltip", () => {
		const now = new Date();
		const fortyFiveMinsAgo = new Date(now.getTime() - 45 * 60 * 1000);

		const task = TaskFactory.createTask({
			timeEstimate: 120,
			timeEntries: [
				{
					startTime: fortyFiveMinsAgo.toISOString(),
					endTime: now.toISOString(),
					description: "Session",
				},
			],
			totalTrackedTime: 45,
		});

		MockObsidian.createTestFile(task.path, "# Test");

		const card = createTaskCard(task, plugin, ["timeProgress"]);

		const progressEl = card.querySelector(".task-card__time-progress");
		expect(progressEl).not.toBeNull();
		// setTooltip mock stores the tooltip in a data-tooltip attribute
		expect(progressEl?.getAttribute("data-tooltip")).toContain("38%");
	});

	it("includes active session (no endTime) in the time calculation", () => {
		const now = new Date();
		const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
		const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

		const task = TaskFactory.createTask({
			timeEstimate: 120,
			timeEntries: [
				{
					startTime: twoHoursAgo.toISOString(),
					endTime: oneHourAgo.toISOString(),
					description: "Completed session",
				},
				{
					// Active session — no endTime
					startTime: thirtyMinsAgo.toISOString(),
					description: "Active session",
				},
			],
			totalTrackedTime: 60, // Only completed time
		});

		MockObsidian.createTestFile(task.path, "# Test");

		const card = createTaskCard(task, plugin, ["timeProgress"]);

		const fill = card.querySelector(".task-card__time-progress-bar-fill") as HTMLElement;
		expect(fill).not.toBeNull();
		// 60 min completed + ~30 min active = ~90 / 120 = ~75%
		const width = parseInt(fill.style.width);
		expect(width).toBeGreaterThanOrEqual(74);
		expect(width).toBeLessThanOrEqual(76);
	});

	it("refreshes bar on updateTaskCard re-render", () => {
		const now = new Date();
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
		const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

		const task = TaskFactory.createTask({
			timeEstimate: 120,
			timeEntries: [
				{
					startTime: oneHourAgo.toISOString(),
					endTime: now.toISOString(),
					description: "Session 1",
				},
			],
			totalTrackedTime: 60,
		});

		MockObsidian.createTestFile(task.path, "# Test");

		const card = createTaskCard(task, plugin, ["timeProgress"]);

		let fill = card.querySelector(".task-card__time-progress-bar-fill") as HTMLElement;
		expect(fill.style.width).toBe("50%");

		// Update task with more tracked time
		const updatedTask = TaskFactory.createTask({
			timeEstimate: 120,
			timeEntries: [
				{
					startTime: twoHoursAgo.toISOString(),
					endTime: now.toISOString(),
					description: "Session 1 extended",
				},
			],
			totalTrackedTime: 120,
		});

		updateTaskCard(card, updatedTask, plugin, ["timeProgress"]);

		fill = card.querySelector(".task-card__time-progress-bar-fill") as HTMLElement;
		expect(fill.style.width).toBe("100%");
	});
});
