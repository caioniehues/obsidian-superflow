/**
 * FocusModeSelector — UI component for choosing between focus modes.
 *
 * Renders a row of mode buttons (Pomodoro / Flowtime / Countdown) and
 * exposes state flags that PomodoroView uses to toggle UI sections.
 */

import { FocusMode } from "../types";

export interface FocusModeSelectorOptions {
	container: any; // HTMLElement (Obsidian-compatible)
	currentMode: FocusMode;
	onModeChange: (mode: FocusMode) => void;
}

export interface FocusModeSelectorState {
	currentMode: FocusMode;
	availableModes: FocusMode[];
	showCircularProgress: boolean;
	showElapsedTime: boolean;
	showDurationInput: boolean;
	showSessionCounter: boolean;
	showBreakSuggestion: boolean;
}

const ALL_MODES: FocusMode[] = ["pomodoro", "flowtime", "countdown"];

const MODE_LABELS: Record<FocusMode, string> = {
	pomodoro: "Pomodoro",
	flowtime: "Flowtime",
	countdown: "Countdown",
};

export class FocusModeSelector {
	private opts: FocusModeSelectorOptions;
	private currentMode: FocusMode;
	private isDisabled = false;
	private buttonsContainer: HTMLElement | null = null;

	constructor(opts: FocusModeSelectorOptions) {
		this.opts = opts;
		this.currentMode = opts.currentMode;
	}

	render(): void {
		const { container } = this.opts;
		container.empty();

		const row = container.createEl("div", { cls: "focus-mode-selector" });
		this.buttonsContainer = row;

		for (const mode of ALL_MODES) {
			const btn = row.createEl("button", {
				text: MODE_LABELS[mode],
				cls: `focus-mode-selector__btn focus-mode-selector__btn--${mode}`,
			});

			if (mode === this.currentMode) {
				btn.addClass("focus-mode-selector__btn--active");
			}

			btn.addEventListener("click", () => {
				if (this.isDisabled) return;
				this.setMode(mode);
			});
		}
	}

	setDisabled(disabled: boolean): void {
		this.isDisabled = disabled;
		if (!this.buttonsContainer) return;
		const buttons = this.buttonsContainer.querySelectorAll('button');
		buttons.forEach(btn => {
			if (disabled) {
				btn.setAttribute('disabled', 'true');
				btn.addClass('focus-mode-selector__btn--disabled');
			} else {
				btn.removeAttribute('disabled');
				btn.removeClass('focus-mode-selector__btn--disabled');
			}
		});
	}

	setMode(mode: FocusMode): void {
		this.currentMode = mode;
		this.opts.onModeChange(mode);
		this.render();
	}

	getState(): FocusModeSelectorState {
		return {
			currentMode: this.currentMode,
			availableModes: [...ALL_MODES],
			showCircularProgress: this.currentMode !== "flowtime",
			showElapsedTime: this.currentMode === "flowtime",
			showDurationInput: this.currentMode === "countdown",
			showSessionCounter: true, // always shown
			showBreakSuggestion: this.currentMode === "flowtime",
		};
	}
}
