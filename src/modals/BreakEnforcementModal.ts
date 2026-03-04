import { App, Modal } from "obsidian";

export interface BreakEnforcementOptions {
	breakDurationMinutes: number;
	enforcement: "soft" | "strict";
	message?: string;
}

/**
 * Modal that encourages (or enforces) taking a break after a focus session.
 *
 * - **soft**: shows a "Skip Break" button immediately.
 * - **strict**: disables "Skip Break" for the first 30 seconds.
 *
 * The modal auto-closes when the break countdown reaches zero.
 */
export class BreakEnforcementModal extends Modal {
	private options: BreakEnforcementOptions;
	private countdownInterval: ReturnType<typeof setInterval> | null = null;
	private enableSkipTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(app: App, options: BreakEnforcementOptions) {
		super(app);
		this.options = options;
	}

	/** Utility: check whether the modal should be shown at all. */
	static shouldShow(enforcement: "none" | "soft" | "strict"): boolean {
		return enforcement !== "none";
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		const totalSeconds = this.options.breakDurationMinutes * 60;
		let remaining = totalSeconds;

		// Heading
		contentEl.createEl("h2", { text: "Break Time" });

		// Configurable message
		contentEl.createEl("p", {
			text: this.options.message ?? "Time for a break!",
		});

		// Countdown display
		const countdownEl = contentEl.createEl("p", {
			text: this.formatTime(remaining),
			cls: "break-enforcement-countdown",
		});

		// Button container
		const btnContainer = contentEl.createEl("div", {
			cls: "modal-button-container",
		});

		// Skip button
		const skipBtn = btnContainer.createEl("button", { text: "Skip Break" });
		skipBtn.addEventListener("click", () => this.close());

		if (this.options.enforcement === "strict") {
			skipBtn.disabled = true;
			this.enableSkipTimeout = setTimeout(() => {
				skipBtn.disabled = false;
			}, 30_000);
		}

		// Countdown ticker
		this.countdownInterval = setInterval(() => {
			remaining--;
			countdownEl.setText(this.formatTime(remaining));
			if (remaining <= 0) {
				this.close();
			}
		}, 1_000);
	}

	onClose() {
		if (this.countdownInterval) {
			clearInterval(this.countdownInterval);
			this.countdownInterval = null;
		}
		if (this.enableSkipTimeout) {
			clearTimeout(this.enableSkipTimeout);
			this.enableSkipTimeout = null;
		}
		const { contentEl } = this;
		contentEl.empty();
	}

	private formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${s.toString().padStart(2, "0")}`;
	}
}
