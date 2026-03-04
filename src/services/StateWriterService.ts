import * as fs from "fs";
import * as path from "path";
import type { EventRef } from "obsidian";
import type TaskNotesPlugin from "../main";
import type { SuperFlowState, TaskInfo } from "../types";
import {
	EVENT_TASK_UPDATED,
	EVENT_POMODORO_TICK,
	EVENT_DATA_CHANGED,
} from "../types";
import { getActiveTimeEntry } from "../utils/helpers";

const DEBOUNCE_MS = 300;
const DEFAULT_STATE_DIR = ".config/superflow";
const DEFAULT_STATE_FILE = "state.json";

/**
 * Writes a JSON snapshot of plugin state to disk so external tools
 * (tray app, CLI, etc.) can read current focus/task information.
 *
 * Follows the StatusBarService init/update/destroy pattern.
 */
export class StateWriterService {
	private plugin: TaskNotesPlugin;
	private statePath: string;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private eventRefs: EventRef[] = [];

	constructor(plugin: TaskNotesPlugin) {
		this.plugin = plugin;
		this.statePath =
			plugin.settings.superflowStateFilePath ??
			path.join(require("os").homedir(), DEFAULT_STATE_DIR, DEFAULT_STATE_FILE);
	}

	/**
	 * Subscribe to plugin events that should trigger a state write.
	 */
	async init(): Promise<void> {
		const handler = () => this.requestWrite();

		this.eventRefs.push(this.plugin.emitter.on(EVENT_TASK_UPDATED, handler));
		this.eventRefs.push(this.plugin.emitter.on(EVENT_POMODORO_TICK, handler));
		this.eventRefs.push(this.plugin.emitter.on(EVENT_DATA_CHANGED, handler));
	}

	/**
	 * Request a debounced write. Multiple rapid calls collapse into one write.
	 */
	requestWrite(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = setTimeout(() => {
			void this.writeStateNow();
		}, DEBOUNCE_MS);
	}

	/**
	 * Build the state snapshot from current plugin state.
	 * Pure data aggregation — no side effects.
	 */
	async buildStateSnapshot(): Promise<SuperFlowState> {
		const pomodoroState = this.plugin.pomodoroService?.getState?.();
		const allTasks: TaskInfo[] =
			(await this.plugin.cacheManager?.getAllTasks?.()) ?? [];
		const trackedTask: TaskInfo | null =
			allTasks.find(t => !!(getActiveTimeEntry(t.timeEntries ?? []))) ?? null;

		// Filter today's tasks
		const today = new Date().toISOString().split("T")[0];
		const todayTasks = allTasks
			.filter((t) => t.scheduled === today)
			.map((t) => ({
				path: t.path,
				title: t.title,
				status: t.status,
				timeEstimate: t.timeEstimate != null ? t.timeEstimate * 60 * 1000 : null,
				totalTrackedTime: this.calculateTotalTrackedTimeMs(t),
			}));

		// Timer state
		const session = pomodoroState?.currentSession;
		const durationSec = session ? session.plannedDuration * 60 : 0;
		const remainingSec = pomodoroState?.timeRemaining ?? 0;
		const elapsedSec = durationSec - remainingSec;
		const progress = durationSec > 0 ? Math.min(1, Math.max(0, elapsedSec / durationSec)) : 0;

		return {
			version: 1,
			timestamp: new Date().toISOString(),
			currentTask: trackedTask
				? {
						path: trackedTask.path,
						title: trackedTask.title,
						timeEstimate:
							trackedTask.timeEstimate != null
								? trackedTask.timeEstimate * 60 * 1000
								: null,
						totalTrackedTime: this.calculateTotalTrackedTimeMs(trackedTask),
						status: trackedTask.status,
						project: trackedTask.projects?.[0],
					}
				: null,
			timer: {
				mode: session ? (session.type === "work" ? "pomodoro" : session.type) : "none",
				isRunning: pomodoroState?.isRunning ?? false,
				progress,
				timeRemaining: remainingSec,
				sessionType: session?.type ?? "work",
			},
			todayTasks,
			settings: {
				stateFilePath: this.statePath,
			},
		};
	}

	/**
	 * Write state to disk immediately (non-debounced).
	 * Uses atomic write: write to .tmp then rename.
	 */
	async writeStateNow(): Promise<void> {
		try {
			const snapshot = await this.buildStateSnapshot();
			const json = JSON.stringify(snapshot, null, 2);
			const dir = path.dirname(this.statePath);
			const tmpPath = this.statePath + ".tmp";

			await fs.promises.mkdir(dir, { recursive: true });
			await fs.promises.writeFile(tmpPath, json, "utf-8");
			await fs.promises.rename(tmpPath, this.statePath);
		} catch (err) {
			// Silently ignore write failures — external state is best-effort
			console.debug("[SuperFlow] StateWriter: write failed", err);
		}
	}

	/**
	 * Get the configured state file path.
	 */
	getStatePath(): string {
		return this.statePath;
	}

	/**
	 * Remove all event listeners and cancel pending writes.
	 */
	destroy(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		for (const ref of this.eventRefs) {
			this.plugin.emitter.offref(ref);
		}
		this.eventRefs = [];
	}

	/**
	 * Calculate total tracked time in milliseconds from time entries,
	 * including active (no endTime) entries.
	 */
	private calculateTotalTrackedTimeMs(task: TaskInfo): number {
		const entries = task.timeEntries ?? [];
		let totalMs = 0;
		for (const entry of entries) {
			if (entry.endTime) {
				totalMs +=
					new Date(entry.endTime).getTime() -
					new Date(entry.startTime).getTime();
			} else {
				// Active entry — count elapsed time up to now
				totalMs += Date.now() - new Date(entry.startTime).getTime();
			}
		}
		return Math.max(0, totalMs);
	}
}
