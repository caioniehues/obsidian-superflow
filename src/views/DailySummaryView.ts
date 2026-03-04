import { ItemView, WorkspaceLeaf, EventRef } from "obsidian";
import TaskNotesPlugin from "../main";
import { DAILY_SUMMARY_VIEW_TYPE, EVENT_TASK_UPDATED, TaskInfo } from "../types";

export interface DailySummaryData {
	tasksCompletedToday: number;
	totalMinutesToday: number;
	focusSessionsCompleted: number;
	perTaskBreakdown: Array<{ title: string; path: string; minutes: number }>;
	perProjectBreakdown: Array<{ project: string; minutes: number }>;
	isEmpty: boolean;
}

export class DailySummaryView extends ItemView {
	plugin: TaskNotesPlugin;
	private listeners: EventRef[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: TaskNotesPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return DAILY_SUMMARY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Daily Summary";
	}

	getIcon(): string {
		return "calendar-check";
	}

	async onOpen(): Promise<void> {
		await this.plugin.onReady();

		// Register live update listener
		const ref = this.plugin.emitter.on(EVENT_TASK_UPDATED, () => {
			this.render();
		});
		this.listeners.push(ref);

		await this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
		this.listeners.forEach((ref) => this.plugin.emitter.offref(ref));
		this.listeners = [];
	}

	async render(): Promise<void> {
		this.contentEl.empty();
		const container = this.contentEl.createDiv({
			cls: "tasknotes-plugin tasknotes-container daily-summary-view",
		});

		const summary = await this.computeDailySummary();

		// Header
		container.createEl("h2", { text: "Daily Summary" });

		if (summary.isEmpty) {
			container.createEl("p", {
				text: "No work recorded today",
				cls: "daily-summary-empty",
			});
			return;
		}

		// Overview stats
		const overview = container.createDiv({ cls: "daily-summary-overview" });
		this.renderStatCard(overview, "Tasks Completed", String(summary.tasksCompletedToday));
		this.renderStatCard(overview, "Time Tracked", this.formatMinutes(summary.totalMinutesToday));
		this.renderStatCard(overview, "Focus Sessions", String(summary.focusSessionsCompleted));

		// Per-task breakdown
		if (summary.perTaskBreakdown.length > 0) {
			const taskSection = container.createDiv({ cls: "daily-summary-tasks" });
			taskSection.createEl("h3", { text: "Per-Task Breakdown" });
			const table = taskSection.createEl("table");
			const thead = table.createEl("thead");
			const headerRow = thead.createEl("tr");
			headerRow.createEl("th", { text: "Task" });
			headerRow.createEl("th", { text: "Time" });

			const tbody = table.createEl("tbody");
			for (const entry of summary.perTaskBreakdown) {
				const row = tbody.createEl("tr");
				row.createEl("td", { text: entry.title });
				row.createEl("td", { text: this.formatMinutes(entry.minutes) });
			}
		}

		// Per-project breakdown
		if (summary.perProjectBreakdown.length > 0) {
			const projectSection = container.createDiv({ cls: "daily-summary-projects" });
			projectSection.createEl("h3", { text: "Per-Project Breakdown" });
			const table = projectSection.createEl("table");
			const thead = table.createEl("thead");
			const headerRow = thead.createEl("tr");
			headerRow.createEl("th", { text: "Project" });
			headerRow.createEl("th", { text: "Time" });

			const tbody = table.createEl("tbody");
			for (const entry of summary.perProjectBreakdown) {
				const row = tbody.createEl("tr");
				row.createEl("td", { text: entry.project });
				row.createEl("td", { text: this.formatMinutes(entry.minutes) });
			}
		}
	}

	/**
	 * Compute the daily summary data. Public for testing.
	 */
	async computeDailySummary(): Promise<DailySummaryData> {
		const tasks = await this.plugin.cacheManager.getAllTasks();
		const today = new Date();
		const todayStr = today.toISOString().split("T")[0];

		// Tasks completed today
		const tasksCompletedToday = tasks.filter(
			(t: TaskInfo) =>
				this.plugin.statusManager.isCompletedStatus(t.status) &&
				t.completedDate === todayStr
		).length;

		// Midnight of today in local time — entries at or after this are "today"
		const midnight = new Date(today);
		midnight.setHours(0, 0, 0, 0);

		// Compute time directly from timeEntries (avoids endDate <= now issues in tests)
		let totalMinutesToday = 0;
		const perTaskBreakdown: Array<{ title: string; path: string; minutes: number }> = [];
		const projectMinutes = new Map<string, number>();

		for (const task of tasks) {
			if (!task.timeEntries || task.timeEntries.length === 0) continue;
			let taskMinutes = 0;
			for (const entry of task.timeEntries) {
				const entryStart = new Date(entry.startTime);
				if (entryStart >= midnight) {
					const entryEnd = entry.endTime ? new Date(entry.endTime) : new Date();
					taskMinutes += Math.floor(
						(entryEnd.getTime() - entryStart.getTime()) / 60000
					);
				}
			}
			if (taskMinutes > 0) {
				totalMinutesToday += taskMinutes;
				perTaskBreakdown.push({ title: task.title, path: task.path, minutes: taskMinutes });
				if (task.projects) {
					for (const project of task.projects) {
						projectMinutes.set(project, (projectMinutes.get(project) ?? 0) + taskMinutes);
					}
				}
			}
		}

		perTaskBreakdown.sort((a, b) => b.minutes - a.minutes);

		const perProjectBreakdown = Array.from(projectMinutes.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([project, minutes]) => ({ project, minutes }));

		// Focus sessions from pomodoro service
		let focusSessionsCompleted = 0;
		try {
			const pomodoroStats = await this.plugin.pomodoroService.getTodayStats();
			focusSessionsCompleted = pomodoroStats.pomodorosCompleted;
		} catch {
			// Pomodoro service may not be available
		}

		const isEmpty =
			tasksCompletedToday === 0 &&
			totalMinutesToday === 0 &&
			focusSessionsCompleted === 0;

		return {
			tasksCompletedToday,
			totalMinutesToday,
			focusSessionsCompleted,
			perTaskBreakdown,
			perProjectBreakdown,
			isEmpty,
		};
	}

	private renderStatCard(container: HTMLElement, label: string, value: string): void {
		const card = container.createDiv({ cls: "daily-summary-stat-card" });
		card.createEl("div", { text: value, cls: "daily-summary-stat-value" });
		card.createEl("div", { text: label, cls: "daily-summary-stat-label" });
	}

	private formatMinutes(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h === 0) return `${m}m`;
		return `${h}h ${m}m`;
	}
}
