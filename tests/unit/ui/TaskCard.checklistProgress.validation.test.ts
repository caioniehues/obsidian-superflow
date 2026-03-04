/**
 * Validation tests for the checklist progress bar feature.
 * Confirms existing behavior + edge cases for getChecklistProgress / calculateChecklistProgress.
 */
import { createTaskCard } from "../../../src/ui/TaskCard";
import { TaskFactory } from "../../helpers/mock-factories";
import { App, MockObsidian } from "../../__mocks__/obsidian";

jest.mock("obsidian");

jest.mock("../../../src/utils/helpers", () => ({
	calculateTotalTimeSpent: jest.fn(() => 0),
	getActiveTimeEntry: jest.fn(() => null),
	formatTime: jest.fn((m: number) => {
		if (!m) return "0m";
		const h = Math.floor(m / 60);
		const mins = m % 60;
		if (h === 0) return `${mins}m`;
		if (mins === 0) return `${h}h`;
		return `${h}h ${mins}m`;
	}),
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
		if (value instanceof Date) return value.toISOString().split("T")[0];
		return value?.split("T")[0] || "";
	}),
}));

jest.mock("../../../src/components/TaskContextMenu", () => ({
	TaskContextMenu: jest.fn().mockImplementation(() => ({ show: jest.fn() })),
}));

function createPlugin(app: App): any {
	return {
		app,
		fieldMapper: {
			lookupMappingKey: jest.fn((propertyId: string) => {
				const mapped = new Set(["status", "priority", "due", "scheduled", "contexts", "projects"]);
				return mapped.has(propertyId) ? propertyId : null;
			}),
			isPropertyForField: jest.fn((propertyId: string, field: string) => propertyId === field),
			toUserField: jest.fn((field: string) => field),
			getMapping: jest.fn(() => ({
				status: "status", priority: "priority", due: "due",
				scheduled: "scheduled", contexts: "contexts", projects: "projects",
			})),
		},
		statusManager: {
			isCompletedStatus: jest.fn((status: string) => status === "done"),
			getStatusConfig: jest.fn((s: string) => ({ value: s, label: s, color: "#666" })),
			getNextStatus: jest.fn(() => "done"),
			getCompletedStatuses: jest.fn(() => ["done"]),
		},
		priorityManager: {
			getPriorityConfig: jest.fn((p: string) => ({ value: p, label: p, color: "#f00" })),
		},
		getActiveTimeSession: jest.fn(() => null),
		cacheManager: { getTaskInfo: jest.fn() },
		updateTaskProperty: jest.fn(),
		getTaskByPath: jest.fn(),
		projectSubtasksService: {
			isTaskUsedAsProject: jest.fn().mockResolvedValue(false),
			isTaskUsedAsProjectSync: jest.fn().mockReturnValue(false),
		},
		i18n: { translate: jest.fn((key: string) => key) },
		settings: {
			singleClickAction: "edit",
			doubleClickAction: "none",
			showExpandableSubtasks: true,
			subtaskChevronPosition: "right",
			hideCompletedFromOverdue: true,
			calendarViewSettings: { timeFormat: "24" },
		},
	};
}

function listItem(taskChar: string, parent: number, line: number) {
	return {
		task: taskChar,
		parent,
		position: {
			start: { line, col: 0, offset: 0 },
			end: { line, col: 10, offset: 10 },
		},
	};
}

describe("Checklist progress — validation and edge cases", () => {
	let app: App;
	let plugin: any;

	beforeEach(() => {
		jest.clearAllMocks();
		MockObsidian.reset();
		app = new App();
		plugin = createPlugin(app);
		jest.spyOn(console, "error").mockImplementation(() => {});
		jest.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("renders on Kanban view (default card)", () => {
		const task = TaskFactory.createTask({
			path: "tasks/kanban-task.md",
			title: "Kanban task",
		});

		MockObsidian.createTestFile(task.path, "# Kanban task");
		app.metadataCache.setCache(task.path, {
			frontmatter: { title: task.title },
			listItems: [
				listItem("x", -1, 10),
				listItem(" ", -1, 11),
			],
		});

		const card = createTaskCard(task, plugin, ["checklistProgress"]);

		expect(card.querySelector(".task-card__progress")).not.toBeNull();
		expect(card.querySelector(".task-card__progress-label")?.textContent).toBe("1/2");
	});

	it("renders on TaskList view (inline layout)", () => {
		const task = TaskFactory.createTask({
			path: "tasks/list-task.md",
			title: "List task",
		});

		MockObsidian.createTestFile(task.path, "# List task");
		app.metadataCache.setCache(task.path, {
			frontmatter: { title: task.title },
			listItems: [
				listItem("x", -1, 10),
				listItem("x", -1, 11),
				listItem(" ", -1, 12),
			],
		});

		const card = createTaskCard(task, plugin, ["checklistProgress"], { layout: "inline" });

		expect(card.querySelector(".task-card__progress")).not.toBeNull();
		expect(card.querySelector(".task-card__progress-label")?.textContent).toBe("2/3");
	});

	it("returns null (no bar) when no list items exist", () => {
		const task = TaskFactory.createTask({
			path: "tasks/empty-task.md",
			title: "No checklist",
		});

		MockObsidian.createTestFile(task.path, "# No checklist");
		app.metadataCache.setCache(task.path, {
			frontmatter: { title: task.title },
			listItems: [],
		});

		const card = createTaskCard(task, plugin, ["checklistProgress"]);

		expect(card.querySelector(".task-card__progress")).toBeNull();
	});

	it("handles 0% — all items incomplete", () => {
		const task = TaskFactory.createTask({
			path: "tasks/zero-task.md",
			title: "Zero percent",
		});

		MockObsidian.createTestFile(task.path, "# Zero");
		app.metadataCache.setCache(task.path, {
			frontmatter: { title: task.title },
			listItems: [
				listItem(" ", -1, 10),
				listItem(" ", -1, 11),
				listItem(" ", -1, 12),
			],
		});

		const card = createTaskCard(task, plugin, ["checklistProgress"]);

		expect(card.querySelector(".task-card__progress-label")?.textContent).toBe("0/3");
		expect((card.querySelector(".task-card__progress-fill") as HTMLElement).style.width).toBe("0%");
	});

	it("handles 100% — all items complete", () => {
		const task = TaskFactory.createTask({
			path: "tasks/full-task.md",
			title: "Full progress",
		});

		MockObsidian.createTestFile(task.path, "# Full");
		app.metadataCache.setCache(task.path, {
			frontmatter: { title: task.title },
			listItems: [
				listItem("x", -1, 10),
				listItem("X", -1, 11),
				listItem("x", -1, 12),
			],
		});

		const card = createTaskCard(task, plugin, ["checklistProgress"]);

		expect(card.querySelector(".task-card__progress-label")?.textContent).toBe("3/3");
		expect((card.querySelector(".task-card__progress-fill") as HTMLElement).style.width).toBe("100%");
	});

	it("rounds 33.33% (1/3) to 33%", () => {
		const task = TaskFactory.createTask({
			path: "tasks/third-task.md",
			title: "One third",
		});

		MockObsidian.createTestFile(task.path, "# One third");
		app.metadataCache.setCache(task.path, {
			frontmatter: { title: task.title },
			listItems: [
				listItem("x", -1, 10),
				listItem(" ", -1, 11),
				listItem(" ", -1, 12),
			],
		});

		const card = createTaskCard(task, plugin, ["checklistProgress"]);

		const fill = card.querySelector(".task-card__progress-fill") as HTMLElement;
		expect(fill.style.width).toBe("33%");

		// Tooltip should show the rounded percentage
		const progressEl = card.querySelector(".task-card__progress");
		expect(progressEl?.getAttribute("data-tooltip")).toContain("33%");
	});
});
