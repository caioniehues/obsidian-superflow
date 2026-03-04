import { TaskInfo, STATS_VIEW_TYPE } from "../types";
import { RequestDeduplicator } from "../utils/RequestDeduplicator";
import { formatTime } from "../utils/helpers";
import { setTooltip, TFile } from "obsidian";
import { openTaskSelector } from "../modals/TaskSelectorWithCreateModal";

export class StatusBarService {
	private plugin: import("../main").default;
	private statusBarElement: HTMLElement | null = null;
	private totalTimeTodayElement: HTMLElement | null = null;
	private requestDeduplicator: RequestDeduplicator;
	private updateTimeout: number | null = null;

	constructor(plugin: import("../main").default) {
		this.plugin = plugin;
		this.requestDeduplicator = new RequestDeduplicator();
	}

	/**
	 * Initialize the status bar service
	 */
	initialize(): void {
		if (!this.plugin.settings.showTrackedTasksInStatusBar) {
			return;
		}

		// Create status bar element
		this.statusBarElement = this.plugin.addStatusBarItem();
		this.statusBarElement.addClass("tasknotes-status-bar");
		this.statusBarElement.style.cursor = "pointer";

		// Add click handler to open tasks view filtered to tracked tasks
		this.statusBarElement.addEventListener("click", () => {
			this.handleStatusBarClick();
		});

		// Initial update
		this.updateStatusBar();

		// Total time today status bar element
		if (this.plugin.settings.showTotalTimeToday) {
			this.initTotalTimeToday();
		}
	}

	private initTotalTimeToday(): void {
		this.totalTimeTodayElement = this.plugin.addStatusBarItem();
		this.totalTimeTodayElement.addClass("tasknotes-status-bar-total-time");
		this.totalTimeTodayElement.style.cursor = "pointer";
		this.totalTimeTodayElement.addEventListener("click", () => {
			this.openStatsView();
		});
		this.updateTotalTimeToday();
	}

	private async openStatsView(): Promise<void> {
		const leaves = this.plugin.app.workspace.getLeavesOfType(STATS_VIEW_TYPE);
		if (leaves.length > 0) {
			this.plugin.app.workspace.revealLeaf(leaves[0]);
		} else {
			const leaf = this.plugin.app.workspace.getLeaf(true);
			await leaf.setViewState({ type: STATS_VIEW_TYPE, active: true });
		}
	}

	private async updateTotalTimeToday(): Promise<void> {
		if (!this.totalTimeTodayElement) return;

		try {
			const allTasks = await this.plugin.cacheManager.getAllTasks();
			const totalMinutes = this.computeTodayMinutes(allTasks);
			this.renderTotalTimeToday(totalMinutes);
		} catch (error) {
			console.error("Error updating total time today:", error);
		}
	}

	private computeTodayMinutes(tasks: TaskInfo[]): number {
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

		let total = 0;

		for (const task of tasks) {
			if (!task.timeEntries || task.timeEntries.length === 0) continue;

			for (const entry of task.timeEntries) {
				const entryStart = new Date(entry.startTime);
				if (entryStart < todayStart || entryStart >= todayEnd) continue;

				if (!entry.endTime) {
					// Active session
					total += Math.max(0, Math.floor((Date.now() - entryStart.getTime()) / (1000 * 60)));
				} else {
					const entryEnd = new Date(entry.endTime);
					total += Math.max(0, Math.floor((entryEnd.getTime() - entryStart.getTime()) / (1000 * 60)));
				}
			}
		}

		return total;
	}

	private renderTotalTimeToday(minutes: number): void {
		if (!this.totalTimeTodayElement) return;

		this.totalTimeTodayElement.empty();
		this.totalTimeTodayElement.createEl("span", {
			text: `Today: ${formatTime(minutes)}`,
		});
	}

	/**
	 * Update the status bar display
	 */
	private async updateStatusBar(): Promise<void> {
		if (!this.statusBarElement || !this.plugin.settings.showTrackedTasksInStatusBar) {
			return;
		}

		try {
			// Use request deduplicator to prevent excessive updates
			const trackedTasks = await this.requestDeduplicator.execute("update-status-bar", () =>
				this.getTrackedTasks()
			);

			this.renderStatusBar(trackedTasks);
		} catch (error) {
			console.error("Error updating status bar:", error);
		}
	}

	/**
	 * Get all currently tracked tasks (tasks with active time sessions)
	 */
	private async getTrackedTasks(): Promise<TaskInfo[]> {
		// Force a fresh lookup of all tasks to avoid stale data
		const allTasks = await this.plugin.cacheManager.getAllTasks();

		return allTasks.filter((task) => {
			// Skip archived tasks
			if (task.archived) return false;

			// Check if task has an active time session
			const activeSession = this.plugin.getActiveTimeSession(task);
			return activeSession !== null;
		});
	}

	/**
	 * Render the status bar with tracked tasks information
	 */
	private renderStatusBar(trackedTasks: TaskInfo[]): void {
		if (!this.statusBarElement) return;

		const count = trackedTasks.length;

		if (count === 0) {
			// Hide status bar when no tasks are being tracked
			this.statusBarElement.style.display = "none";
			return;
		}

		// Show status bar
		this.statusBarElement.style.display = "";

		// Clear previous content
		this.statusBarElement.empty();

		// Create icon
		this.statusBarElement.createEl("span", {
			cls: "tasknotes-status-icon",
			text: "⏱️",
		});

		// Create text content
		const textEl = this.statusBarElement.createEl("span", {
			cls: "tasknotes-status-text",
		});

		if (count === 1) {
			const task = trackedTasks[0];
			const truncatedTitle =
				task.title.length > 30 ? task.title.substring(0, 30) + "..." : task.title;
			textEl.setText(`Tracking: ${truncatedTitle}`);

			// Add tooltip with full title
			setTooltip(this.statusBarElement, `Currently tracking: ${task.title}`, {
				placement: "top",
			});
		} else {
			textEl.setText(`Tracking ${count} tasks`);

			// Add tooltip with task titles
			const taskTitles = trackedTasks
				.slice(0, 5) // Show max 5 in tooltip
				.map((task) => task.title)
				.join("\n");
			const tooltipText = count > 5 ? `${taskTitles}\n... and ${count - 5} more` : taskTitles;
			setTooltip(this.statusBarElement, `Currently tracking:\n${tooltipText}`, {
				placement: "top",
			});
		}
	}

	/**
	 * Handle click on status bar - open task note(s)
	 */
	private async handleStatusBarClick(): Promise<void> {
		try {
			// Get tracked tasks
			const trackedTasks = await this.getTrackedTasks();

			if (trackedTasks.length === 0) {
				return;
			}

			if (trackedTasks.length === 1) {
				// Single tracked task - open its note directly
				const task = trackedTasks[0];
				const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
				if (file instanceof TFile) {
					await this.plugin.app.workspace.getLeaf(false).openFile(file);
				}
			} else {
				// Multiple tracked tasks - show selector modal
				openTaskSelector(this.plugin, trackedTasks, async (selectedTask) => {
					if (selectedTask) {
						const file = this.plugin.app.vault.getAbstractFileByPath(selectedTask.path);
						if (file instanceof TFile) {
							await this.plugin.app.workspace.getLeaf(false).openFile(file);
						}
					}
				});
			}
		} catch (error) {
			console.error("Error handling status bar click:", error);
		}
	}

	/**
	 * Request an update to the status bar (debounced)
	 */
	requestUpdate(): void {
		// Clear existing timeout
		if (this.updateTimeout) {
			window.clearTimeout(this.updateTimeout);
		}

		// Debounce updates to prevent excessive re-renders
		this.updateTimeout = window.setTimeout(() => {
			this.updateStatusBar();
			this.updateTotalTimeToday();
		}, 100);
	}

	/**
	 * Show or hide the status bar based on settings
	 */
	updateVisibility(): void {
		if (this.plugin.settings.showTrackedTasksInStatusBar) {
			if (!this.statusBarElement) {
				this.initialize();
			} else {
				this.updateStatusBar();
			}
		} else {
			this.hide();
		}
	}

	/**
	 * Hide the status bar
	 */
	private hide(): void {
		if (this.statusBarElement) {
			this.statusBarElement.style.display = "none";
		}
	}

	/**
	 * Briefly flash the status bar element to draw attention.
	 * Adds a CSS class that triggers an animation, then removes it.
	 */
	flash(): void {
		if (!this.statusBarElement) return;

		const cls = "tasknotes-status-bar--flash";
		this.statusBarElement.addClass(cls);
		window.setTimeout(() => {
			this.statusBarElement?.removeClass(cls);
		}, 1500);
	}

	/**
	 * Cleanup when service is destroyed
	 */
	destroy(): void {
		if (this.updateTimeout) {
			window.clearTimeout(this.updateTimeout);
			this.updateTimeout = null;
		}

		if (this.requestDeduplicator) {
			this.requestDeduplicator.cancelAll();
		}

		// Status bar elements are automatically cleaned up by Obsidian when plugin unloads
		this.statusBarElement = null;
		this.totalTimeTodayElement = null;
	}
}
