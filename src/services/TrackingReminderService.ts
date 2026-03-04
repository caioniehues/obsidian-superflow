import { Notice } from "obsidian";
import type TaskNotesPlugin from "../main";
import type { StatusBarService } from "./StatusBarService";
import { EVENT_TASK_UPDATED } from "../types";
import { getActiveTimeEntry } from "../utils/helpers";

/**
 * Reminds the user when no task is being actively time-tracked
 * for longer than the configured idle threshold.
 */
export class TrackingReminderService {
	private plugin: TaskNotesPlugin;
	private statusBarService: StatusBarService;
	private checkInterval: number | null = null;
	private lastActiveTimestamp: number = Date.now();
	private eventHandler: (() => void) | null = null;

	constructor(plugin: TaskNotesPlugin, statusBarService: StatusBarService) {
		this.plugin = plugin;
		this.statusBarService = statusBarService;
	}

	initialize(): void {
		const minutes = this.plugin.settings.trackingReminderMinutes;
		if (!minutes || minutes <= 0) {
			return;
		}

		this.lastActiveTimestamp = Date.now();

		// Check every minute
		this.checkInterval = window.setInterval(() => {
			this.checkIdleState();
		}, 60 * 1000);

		// Listen for task updates to detect tracking start/stop
		this.eventHandler = () => this.onTaskUpdated();
		this.plugin.emitter.on(EVENT_TASK_UPDATED, this.eventHandler);
	}

	private async checkIdleState(): Promise<void> {
		const minutes = this.plugin.settings.trackingReminderMinutes;
		if (!minutes || minutes <= 0) {
			return;
		}

		// Check if any task is currently being tracked
		if (await this.isAnyTaskTracked()) {
			this.lastActiveTimestamp = Date.now();
			return;
		}

		const idleMs = Date.now() - this.lastActiveTimestamp;
		const thresholdMs = minutes * 60 * 1000;

		if (idleMs >= thresholdMs) {
			this.fireReminder();
			// Reset to avoid repeated rapid-fire reminders
			this.lastActiveTimestamp = Date.now();
		}
	}

	private async isAnyTaskTracked(): Promise<boolean> {
		// Check if any task has an active time entry (no endTime)
		const tasks = (await this.plugin.cacheManager?.getAllTasks()) ?? [];
		return tasks.some(t => getActiveTimeEntry(t.timeEntries ?? []) !== null);
	}

	private fireReminder(): void {
		this.statusBarService.flash();
		new Notice("No task is being tracked. Start tracking to stay focused!");
	}

	private onTaskUpdated(): void {
		// Reset idle timer whenever a task update occurs
		this.lastActiveTimestamp = Date.now();
	}

	/**
	 * Dismiss the current reminder and reset the idle timer.
	 */
	dismiss(): void {
		this.lastActiveTimestamp = Date.now();
	}

	destroy(): void {
		if (this.checkInterval !== null) {
			window.clearInterval(this.checkInterval);
			this.checkInterval = null;
		}

		if (this.eventHandler) {
			this.plugin.emitter.off(EVENT_TASK_UPDATED, this.eventHandler);
			this.eventHandler = null;
		}
	}
}
