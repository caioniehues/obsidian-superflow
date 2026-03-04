import { App, Modal, setIcon } from "obsidian";
import TaskNotesPlugin from "../main";
import { PlanningService } from "../services/PlanningService";
import { TaskInfo } from "../types";
import { openTaskSelector } from "./TaskSelectorWithCreateModal";

export class PlanningModal extends Modal {
	private plugin: TaskNotesPlugin;
	private planningService: PlanningService;

	constructor(app: App, plugin: TaskNotesPlugin, planningService: PlanningService) {
		super(app);
		this.plugin = plugin;
		this.planningService = planningService;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("planning-modal");

		await this.renderCurrentStep();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async renderCurrentStep(): Promise<void> {
		const step = this.planningService.getState().currentStep;

		switch (step) {
			case "review-yesterday":
				await this.renderReviewYesterday();
				break;
			case "plan-today":
				await this.renderPlanToday();
				break;
			case "estimate":
				await this.renderEstimate();
				break;
			case "done":
				this.renderDone();
				break;
		}
	}

	// ─── Step 1: Review Yesterday ──────────────────────

	private async renderReviewYesterday(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Review Yesterday", cls: "planning-step-heading" });

		const review = await this.planningService.getYesterdayTasks();
		const hasAnyTasks = review.completed.length > 0 || review.incomplete.length > 0;

		if (!hasAnyTasks) {
			contentEl.createEl("p", {
				text: "Nothing to review — no tasks were scheduled yesterday.",
				cls: "planning-empty-message",
			});
			this.planningService.nextStep();
			return;
		}

		if (review.completed.length > 0) {
			const completedSection = contentEl.createDiv({ cls: "planning-completed-tasks" });
			completedSection.createEl("h3", { text: "Completed" });

			for (const task of review.completed) {
				const item = completedSection.createDiv({ cls: ["planning-task-item", "planning-task-completed"] });
				const iconEl = item.createEl("span", { cls: "planning-task-icon" });
				setIcon(iconEl, "check-circle");
				item.createEl("span", { text: task.title, cls: "planning-task-title" });
			}
		}

		if (review.incomplete.length > 0) {
			const incompleteSection = contentEl.createDiv({ cls: "planning-incomplete-tasks" });
			incompleteSection.createEl("h3", { text: "Incomplete" });

			for (const task of review.incomplete) {
				const item = incompleteSection.createDiv({ cls: ["planning-task-item", "planning-task-incomplete"] });
				const iconEl = item.createEl("span", { cls: "planning-task-icon" });
				setIcon(iconEl, "circle");
				item.createEl("span", { text: task.title, cls: "planning-task-title" });

				const actions = item.createDiv({ cls: "planning-task-actions" });
				const moveToTodayBtn = actions.createEl("button", { text: "Move to Today" });
				moveToTodayBtn.addEventListener("click", async () => {
					await this.planningService.moveToToday(task);
					await this.renderReviewYesterday();
				});

				const moveToBacklogBtn = actions.createEl("button", { text: "Move to Backlog" });
				moveToBacklogBtn.addEventListener("click", async () => {
					await this.planningService.moveToBacklog(task);
					await this.renderReviewYesterday();
				});
			}
		}

		const nav = contentEl.createDiv({ cls: "planning-nav" });
		const nextBtn = nav.createEl("button", { text: "Next", cls: "mod-cta" });
		nextBtn.addEventListener("click", async () => {
			this.planningService.nextStep();
			await this.renderCurrentStep();
		});
	}

	// ─── Step 2: Plan Today ────────────────────────────

	private async renderPlanToday(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Plan Today", cls: "planning-step-heading" });

		const todayTasks = await this.planningService.getTodayTasks();

		if (todayTasks.length > 0) {
			const taskList = contentEl.createDiv({ cls: "planning-today-tasks" });
			for (const task of todayTasks) {
				const item = taskList.createDiv({ cls: "planning-task-item" });
				item.createEl("span", { text: task.title, cls: "planning-task-title" });
			}
		} else {
			contentEl.createEl("p", {
				text: "No tasks scheduled for today yet.",
				cls: "planning-empty-message",
			});
		}

		// Add from Backlog button
		const actions = contentEl.createDiv({ cls: "planning-actions" });
		const addFromBacklogBtn = actions.createEl("button", { text: "Add from Backlog" });
		addFromBacklogBtn.addEventListener("click", async () => {
			const backlogTasks = await this.planningService.getBacklog();
			openTaskSelector(
				this.plugin,
				backlogTasks,
				async (selectedTask: TaskInfo | null) => {
					if (selectedTask) {
						await this.planningService.moveToToday(selectedTask);
						await this.renderPlanToday();
					}
				},
				{ title: "Add from Backlog", placeholder: "Search backlog tasks..." }
			);
		});

		const nav = contentEl.createDiv({ cls: "planning-nav" });
		const nextBtn = nav.createEl("button", { text: "Next", cls: "mod-cta" });
		nextBtn.addEventListener("click", async () => {
			this.planningService.nextStep();
			await this.renderCurrentStep();
		});
	}

	// ─── Step 3: Estimate ──────────────────────────────

	private async renderEstimate(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Estimate Tasks", cls: "planning-step-heading" });

		const unestimated = await this.planningService.getUnestimatedTasks();

		if (unestimated.length > 0) {
			const taskList = contentEl.createDiv({ cls: "planning-estimate-tasks" });

			for (const task of unestimated) {
				const item = taskList.createDiv({ cls: "planning-task-item" });
				item.createEl("span", { text: task.title, cls: "planning-task-title" });

				const estimateRow = item.createDiv({ cls: "planning-estimate-row" });
				const input = estimateRow.createEl("input", {
					attr: { type: "number", min: "1", placeholder: "minutes" },
					cls: "planning-estimate-input",
				});

				const saveBtn = estimateRow.createEl("button", { text: "Save" });
				saveBtn.addEventListener("click", async () => {
					const minutes = parseInt(input.value, 10);
					if (minutes > 0) {
						await this.plugin.taskService.updateTask(task, { timeEstimate: minutes });
						await this.renderEstimate();
					}
				});
			}
		} else {
			contentEl.createEl("p", {
				text: "All tasks have estimates!",
				cls: "planning-empty-message",
			});
		}

		const nav = contentEl.createDiv({ cls: "planning-nav" });
		const nextBtn = nav.createEl("button", { text: "Next", cls: "mod-cta" });
		nextBtn.addEventListener("click", async () => {
			this.planningService.nextStep();
			await this.renderCurrentStep();
		});
	}

	// ─── Step 4: Done ──────────────────────────────────

	private renderDone(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Planning Complete!", cls: "planning-step-heading" });
		contentEl.createEl("p", { text: "Your day is planned. Time to get to work!" });

		const nav = contentEl.createDiv({ cls: "planning-nav" });
		const finishBtn = nav.createEl("button", { text: "Finish", cls: "mod-cta" });
		finishBtn.addEventListener("click", () => {
			this.planningService.finishPlanning();
			this.close();
		});
	}
}
