/**
 * FocusEngineService — wraps PomodoroService to support multiple focus modes.
 *
 * Modes:
 *   - pomodoro: classic work/break cycles (delegates fully to PomodoroService)
 *   - flowtime: open-ended work, break suggested based on elapsed time
 *   - countdown: fixed-duration timer, no break cycle
 */

import TaskNotesPlugin from "../main";
import { PomodoroService } from "./PomodoroService";
import {
	FocusMode,
	FocusState,
	FlowtimeBreakSuggestion,
	TaskInfo,
	IWebhookNotifier,
} from "../types";
import { suggestFlowtimeBreak } from "../utils/flowtimeUtils";
import { BreakEnforcementModal } from "../modals/BreakEnforcementModal";
import { EVENT_POMODORO_COMPLETE } from "../types";

export interface StartFocusOptions {
	mode: FocusMode;
	task?: TaskInfo;
	duration?: number; // minutes
}

/** Max duration sentinel for open-ended flowtime (8 hours) */
const FLOWTIME_MAX_DURATION = 480;

export class FocusEngineService {
	readonly pomodoroService: PomodoroService;
	private plugin: TaskNotesPlugin;
	private mode: FocusMode = "pomodoro";
	private breakEnforcementHandler: ((data: any) => void) | null = null;

	constructor(plugin: TaskNotesPlugin) {
		this.plugin = plugin;
		this.pomodoroService = new PomodoroService(plugin);
		this.mode = plugin.settings.defaultFocusMode ?? "pomodoro";
	}

	async initialize(): Promise<void> {
		await this.pomodoroService.initialize();

		// Listen for pomodoro session completion to show break enforcement
		this.breakEnforcementHandler = ({ session, nextType }: any) => {
			if (session?.type === "work") {
				this.maybeShowBreakEnforcement(nextType);
			}
		};
		this.plugin.emitter.on(EVENT_POMODORO_COMPLETE, this.breakEnforcementHandler);
	}

	// ── Focus lifecycle ──────────────────────────────────

	async startFocus(opts: StartFocusOptions): Promise<void> {
		this.mode = opts.mode;

		switch (opts.mode) {
			case "pomodoro":
				await this.pomodoroService.startPomodoro(opts.task, opts.duration);
				break;

			case "flowtime":
				// Open-ended: use a very large duration so the timer doesn't auto-complete
				await this.pomodoroService.startPomodoro(opts.task, FLOWTIME_MAX_DURATION);
				break;

			case "countdown":
				await this.pomodoroService.startPomodoro(opts.task, opts.duration);
				break;
		}
	}

	async pauseFocus(): Promise<void> {
		await this.pomodoroService.pausePomodoro();
	}

	async resumeFocus(): Promise<void> {
		await this.pomodoroService.resumePomodoro();
	}

	async stopFocus(): Promise<void> {
		await this.pomodoroService.stopPomodoro();
		this.mode = this.plugin.settings.defaultFocusMode ?? "pomodoro";
	}

	// ── Mode queries ─────────────────────────────────────

	getMode(): FocusMode {
		return this.mode;
	}

	getState(): FocusState {
		return {
			...this.pomodoroService.getState(),
			mode: this.mode,
		};
	}

	/**
	 * Suggest a break duration based on elapsed work minutes.
	 * Only meaningful in flowtime mode — returns null otherwise.
	 */
	suggestBreak(elapsedWorkMinutes: number): FlowtimeBreakSuggestion | null {
		if (this.mode !== "flowtime") {
			return null;
		}
		return suggestFlowtimeBreak(elapsedWorkMinutes);
	}

	private maybeShowBreakEnforcement(nextType: string): void {
		const settings = this.plugin.settings;
		const enforcement: "none" | "soft" | "strict" = settings.enforceBreaks ?? "none";
		if (!BreakEnforcementModal.shouldShow(enforcement)) return;

		const activeEnforcement = enforcement as "soft" | "strict";
		const isLongBreak = nextType === "long-break";
		const breakDurationMinutes = isLongBreak
			? (settings.pomodoroLongBreakDuration ?? 15)
			: (settings.pomodoroShortBreakDuration ?? 5);

		new BreakEnforcementModal(this.plugin.app, {
			breakDurationMinutes,
			enforcement: activeEnforcement,
		}).open();
	}

	// ── Auto-start integration ──────────────────────────

	/**
	 * Called when time tracking starts on a task.
	 * If autoStartFocusOnTracking is enabled and no session is running,
	 * starts a focus session using the default mode.
	 */
	async handleTimeTrackingStarted(task: TaskInfo): Promise<void> {
		const settings = this.plugin.settings;
		if (!settings.autoStartFocusOnTracking) {
			return;
		}

		const state = this.pomodoroService.getState();
		if (state.isRunning || state.currentSession) {
			return;
		}

		const defaultMode: FocusMode = settings.defaultFocusMode ?? "pomodoro";
		await this.startFocus({ mode: defaultMode, task });
	}

	// ── Delegation passthrough ───────────────────────────

	setWebhookNotifier(notifier: IWebhookNotifier): void {
		this.pomodoroService.setWebhookNotifier(notifier);
	}

	cleanup(): void {
		if (this.breakEnforcementHandler) {
			this.plugin.emitter.off(EVENT_POMODORO_COMPLETE, this.breakEnforcementHandler);
			this.breakEnforcementHandler = null;
		}
		this.pomodoroService.cleanup();
	}
}
