import TaskNotesPlugin from "../main";
import {
	PlanningState,
	PlanningStep,
	YesterdayReview,
	TaskInfo,
} from "../types";

const STEP_ORDER: PlanningStep[] = ['review-yesterday', 'plan-today', 'estimate', 'done'];

export class PlanningService {
	private plugin: TaskNotesPlugin;
	private state: PlanningState;

	constructor(plugin: TaskNotesPlugin) {
		this.plugin = plugin;
		this.state = {
			isActive: false,
			currentStep: 'review-yesterday',
		};
	}

	getState(): PlanningState {
		return { ...this.state };
	}

	startPlanning(): void {
		this.state.isActive = true;
		this.state.currentStep = 'review-yesterday';
	}

	nextStep(): void {
		const currentIndex = STEP_ORDER.indexOf(this.state.currentStep);
		if (currentIndex < STEP_ORDER.length - 1) {
			this.state.currentStep = STEP_ORDER[currentIndex + 1];
		}
	}

	finishPlanning(): void {
		this.state.isActive = false;
		this.state.currentStep = 'review-yesterday';
	}

	async getYesterdayTasks(): Promise<YesterdayReview> {
		const yesterday = this.getDateString(-1);
		const allTasks = await this.plugin.cacheManager.getAllTasks();

		const yesterdayTasks = allTasks.filter(
			(t) => t.scheduled === yesterday
		);

		const completed = yesterdayTasks.filter((t) =>
			this.plugin.statusManager.isCompletedStatus(t.status)
		);
		const incomplete = yesterdayTasks.filter(
			(t) => !this.plugin.statusManager.isCompletedStatus(t.status)
		);

		return { completed, incomplete };
	}

	async getTodayTasks(): Promise<TaskInfo[]> {
		const today = this.getDateString(0);
		const allTasks = await this.plugin.cacheManager.getAllTasks();
		return allTasks.filter((t) => t.scheduled === today);
	}

	async getBacklog(): Promise<TaskInfo[]> {
		const allTasks = await this.plugin.cacheManager.getAllTasks();
		return allTasks.filter(
			(t) =>
				!t.scheduled &&
				!this.plugin.statusManager.isCompletedStatus(t.status)
		);
	}

	async moveToToday(task: TaskInfo): Promise<void> {
		const today = this.getDateString(0);
		await this.plugin.taskService.updateTask(task, { scheduled: today });
	}

	async moveToBacklog(task: TaskInfo): Promise<void> {
		await this.plugin.taskService.updateTask(task, { scheduled: undefined });
	}

	async getUnestimatedTasks(): Promise<TaskInfo[]> {
		const todayTasks = await this.getTodayTasks();
		return todayTasks.filter((t) => !t.timeEstimate);
	}

	/**
	 * Checks whether the daily planning modal should auto-open.
	 * Returns true only when the setting is enabled AND planning
	 * hasn't already been triggered today.
	 */
	async shouldTriggerPlanning(): Promise<boolean> {
		if (!this.plugin.settings.dailyPlanningOnOpen) {
			return false;
		}
		const data = await this.plugin.loadData() ?? {};
		return data.lastPlanningDate !== this.getDateString(0);
	}

	/**
	 * Persists today's date so the vault-open trigger won't fire again.
	 */
	async markPlanningTriggered(): Promise<void> {
		const data = await this.plugin.loadData() ?? {};
		data.lastPlanningDate = this.getDateString(0);
		await this.plugin.saveData(data);
	}

	/**
	 * Returns a YYYY-MM-DD string for today (offset=0) or relative days.
	 * Uses local time so the date matches the user's perspective.
	 */
	private getDateString(offsetDays: number): string {
		const d = new Date();
		d.setDate(d.getDate() + offsetDays);
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
}
