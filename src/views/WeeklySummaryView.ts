import { ItemView, WorkspaceLeaf, EventRef } from "obsidian";
import TaskNotesPlugin from "../main";
import { WEEKLY_SUMMARY_VIEW_TYPE, EVENT_TASK_UPDATED, TaskInfo } from "../types";

interface DayBreakdown {
	dayLabel: string; // "Mon", "Tue", etc.
	date: string; // YYYY-MM-DD
	minutes: number;
}

interface ProjectComparison {
	project: string;
	estimateMinutes: number;
	actualMinutes: number;
	efficiencyRatio: number; // actual / estimated
}

export interface WeeklySummaryData {
	dailyBreakdown: DayBreakdown[];
	projectComparison: ProjectComparison[];
	tasksCompletedThisWeek: number;
	totalMinutesThisWeek: number;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export class WeeklySummaryView extends ItemView {
	plugin: TaskNotesPlugin;
	private listeners: EventRef[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: TaskNotesPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return WEEKLY_SUMMARY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Weekly Summary";
	}

	getIcon(): string {
		return "calendar-range";
	}

	async onOpen(): Promise<void> {
		await this.plugin.onReady();

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
			cls: "tasknotes-plugin tasknotes-container weekly-summary-view",
		});

		const summary = await this.computeWeeklySummary();

		container.createEl("h2", { text: "Weekly Summary" });

		// Overview
		const overview = container.createDiv({ cls: "weekly-summary-overview" });
		this.renderStatCard(overview, "Tasks Completed", String(summary.tasksCompletedThisWeek));
		this.renderStatCard(overview, "Total Time", this.formatMinutes(summary.totalMinutesThisWeek));

		// 7-day grid
		const gridSection = container.createDiv({ cls: "weekly-summary-grid" });
		gridSection.createEl("h3", { text: "Daily Breakdown" });
		const grid = gridSection.createDiv({ cls: "weekly-summary-day-grid" });
		for (const day of summary.dailyBreakdown) {
			const cell = grid.createDiv({ cls: "weekly-summary-day-cell" });
			cell.createEl("div", { text: day.dayLabel, cls: "weekly-summary-day-label" });
			cell.createEl("div", {
				text: day.minutes > 0 ? this.formatMinutes(day.minutes) : "-",
				cls: "weekly-summary-day-value",
			});
		}

		// Project comparison
		if (summary.projectComparison.length > 0) {
			const projSection = container.createDiv({ cls: "weekly-summary-projects" });
			projSection.createEl("h3", { text: "Estimate vs Actual" });
			const table = projSection.createEl("table");
			const thead = table.createEl("thead");
			const headerRow = thead.createEl("tr");
			headerRow.createEl("th", { text: "Project" });
			headerRow.createEl("th", { text: "Estimated" });
			headerRow.createEl("th", { text: "Actual" });
			headerRow.createEl("th", { text: "Efficiency" });

			const tbody = table.createEl("tbody");
			for (const proj of summary.projectComparison) {
				const row = tbody.createEl("tr");
				row.createEl("td", { text: proj.project });
				row.createEl("td", { text: this.formatMinutes(proj.estimateMinutes) });
				row.createEl("td", { text: this.formatMinutes(proj.actualMinutes) });
				row.createEl("td", {
					text: proj.estimateMinutes > 0
						? `${Math.round(proj.efficiencyRatio * 100)}%`
						: "-",
				});
			}
		}
	}

	/**
	 * Compute the weekly summary data. Public for testing.
	 */
	async computeWeeklySummary(): Promise<WeeklySummaryData> {
		const tasks = await this.plugin.cacheManager.getAllTasks();

		// Compute week boundaries (Monday through Sunday)
		const now = new Date();
		const dayOfWeek = now.getDay(); // 0=Sun..6=Sat
		const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
		const monday = new Date(now);
		monday.setDate(now.getDate() + diffToMonday);
		monday.setHours(0, 0, 0, 0);

		const sunday = new Date(monday);
		sunday.setDate(monday.getDate() + 6);
		sunday.setHours(23, 59, 59, 999);

		// Build 7-day date strings
		const weekDates: Date[] = [];
		for (let i = 0; i < 7; i++) {
			const d = new Date(monday);
			d.setDate(monday.getDate() + i);
			weekDates.push(d);
		}
		const weekDateStrs = weekDates.map((d) => d.toISOString().split("T")[0]);

		// Daily time breakdown
		const dailyMinutes = new Array(7).fill(0);
		// Per-project tracking
		const projectActual = new Map<string, number>();
		const projectEstimate = new Map<string, number>();
		const projectTasksCounted = new Set<string>(); // track unique task+project combos

		for (const task of tasks) {
			if (task.timeEntries) {
				for (const entry of task.timeEntries) {
					const entryStart = new Date(entry.startTime);
					if (entryStart < monday || entryStart > sunday) continue;

					const entryDateStr = entryStart.toISOString().split("T")[0];
					const dayIndex = weekDateStrs.indexOf(entryDateStr);
					if (dayIndex === -1) continue;

					let minutes = 0;
					if (entry.endTime) {
						minutes = Math.floor(
							(new Date(entry.endTime).getTime() - entryStart.getTime()) / (1000 * 60)
						);
					} else {
						minutes = Math.floor(
							(Date.now() - entryStart.getTime()) / (1000 * 60)
						);
					}

					dailyMinutes[dayIndex] += minutes;

					// Accumulate project actuals
					if (task.projects) {
						for (const proj of task.projects) {
							projectActual.set(proj, (projectActual.get(proj) || 0) + minutes);

							// Only count estimate once per task+project combo
							const key = `${task.path}|${proj}`;
							if (!projectTasksCounted.has(key)) {
								projectTasksCounted.add(key);
								if (task.timeEstimate && task.timeEstimate > 0) {
									projectEstimate.set(
										proj,
										(projectEstimate.get(proj) || 0) + task.timeEstimate
									);
								}
							}
						}
					}
				}
			}
		}

		const dailyBreakdown: DayBreakdown[] = weekDates.map((d, i) => ({
			dayLabel: DAY_LABELS[i],
			date: weekDateStrs[i],
			minutes: dailyMinutes[i],
		}));

		// Build project comparison (only projects with actual time)
		const projectComparison: ProjectComparison[] = [];
		for (const [project, actual] of projectActual.entries()) {
			if (actual <= 0) continue;
			const estimate = projectEstimate.get(project) || 0;
			projectComparison.push({
				project,
				estimateMinutes: estimate,
				actualMinutes: actual,
				efficiencyRatio: estimate > 0 ? actual / estimate : 0,
			});
		}
		projectComparison.sort((a, b) => b.actualMinutes - a.actualMinutes);

		// Tasks completed this week
		const tasksCompletedThisWeek = tasks.filter((t: TaskInfo) => {
			if (!this.plugin.statusManager.isCompletedStatus(t.status)) return false;
			if (!t.completedDate) return false;
			return t.completedDate >= weekDateStrs[0] && t.completedDate <= weekDateStrs[6];
		}).length;

		const totalMinutesThisWeek = dailyMinutes.reduce((a: number, b: number) => a + b, 0);

		return {
			dailyBreakdown,
			projectComparison,
			tasksCompletedThisWeek,
			totalMinutesThisWeek,
		};
	}

	private renderStatCard(container: HTMLElement, label: string, value: string): void {
		const card = container.createDiv({ cls: "weekly-summary-stat-card" });
		card.createEl("div", { text: value, cls: "weekly-summary-stat-value" });
		card.createEl("div", { text: label, cls: "weekly-summary-stat-label" });
	}

	private formatMinutes(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h === 0) return `${m}m`;
		return `${h}h ${m}m`;
	}
}
