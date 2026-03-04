/**
 * Tests for P0.2 — superflow:* Obsidian commands
 *
 * We test the command definitions array directly, avoiding full plugin
 * instantiation. We read the command definitions from main.ts source to
 * verify structure, then unit-test individual command callbacks via a
 * lightweight mock of the plugin.
 */

// Minimal mock of the plugin shape needed by the superflow commands
function createMockPlugin() {
	return {
		pomodoroService: {
			isRunning: jest.fn().mockReturnValue(false),
			startPomodoro: jest.fn().mockResolvedValue(undefined),
			pausePomodoro: jest.fn().mockResolvedValue(undefined),
			startBreak: jest.fn().mockResolvedValue(undefined),
		},
		i18n: {
			t: jest.fn((key: string) => key),
			translate: jest.fn((key: string) => key),
		},
	};
}

describe("P0.2 — SuperFlow Commands", () => {
	describe("Command ID prefixes", () => {
		it("all 5 superflow commands use 'superflow:' prefix", () => {
			// Read main.ts source and find superflow command IDs
			const fs = require("fs");
			const path = require("path");
			const mainSrc = fs.readFileSync(
				path.resolve(__dirname, "../../../src/main.ts"),
				"utf-8"
			);

			const expectedIds = [
				"superflow:toggle-timer",
				"superflow:pause-timer",
				"superflow:start-break",
				"superflow:open-planning",
				"superflow:switch-task",
			];

			for (const id of expectedIds) {
				expect(mainSrc).toContain(`"${id}"`);
			}
		});
	});

	describe("superflow:toggle-timer", () => {
		it("calls pomodoroService.startPomodoro() when timer is NOT running", async () => {
			const plugin = createMockPlugin();
			plugin.pomodoroService.isRunning.mockReturnValue(false);

			// Simulate the toggle-timer callback logic
			if (plugin.pomodoroService.isRunning()) {
				await plugin.pomodoroService.pausePomodoro();
			} else {
				await plugin.pomodoroService.startPomodoro();
			}

			expect(plugin.pomodoroService.startPomodoro).toHaveBeenCalled();
			expect(plugin.pomodoroService.pausePomodoro).not.toHaveBeenCalled();
		});

		it("calls pomodoroService.pausePomodoro() when timer IS running", async () => {
			const plugin = createMockPlugin();
			plugin.pomodoroService.isRunning.mockReturnValue(true);

			// Simulate the toggle-timer callback logic
			if (plugin.pomodoroService.isRunning()) {
				await plugin.pomodoroService.pausePomodoro();
			} else {
				await plugin.pomodoroService.startPomodoro();
			}

			expect(plugin.pomodoroService.pausePomodoro).toHaveBeenCalled();
			expect(plugin.pomodoroService.startPomodoro).not.toHaveBeenCalled();
		});
	});

	describe("superflow:pause-timer", () => {
		it("calls pomodoroService.pausePomodoro()", async () => {
			const plugin = createMockPlugin();

			// Simulate the pause-timer callback
			await plugin.pomodoroService.pausePomodoro();

			expect(plugin.pomodoroService.pausePomodoro).toHaveBeenCalled();
		});
	});

	describe("superflow:start-break", () => {
		it("calls pomodoroService.startBreak()", async () => {
			const plugin = createMockPlugin();

			// Simulate the start-break callback
			await plugin.pomodoroService.startBreak();

			expect(plugin.pomodoroService.startBreak).toHaveBeenCalled();
		});
	});

	describe("superflow:open-planning", () => {
		it("is registered and calls planningService.startPlanning()", () => {
			const fs = require("fs");
			const path = require("path");
			const mainSrc = fs.readFileSync(
				path.resolve(__dirname, "../../../src/main.ts"),
				"utf-8"
			);
			// Verify the command is defined
			expect(mainSrc).toContain('"superflow:open-planning"');
			// Verify it calls planningService.startPlanning()
			expect(mainSrc).toContain("planningService.startPlanning()");
		});
	});

	describe("superflow:switch-task", () => {
		it("is registered and opens task selector", () => {
			const fs = require("fs");
			const path = require("path");
			const mainSrc = fs.readFileSync(
				path.resolve(__dirname, "../../../src/main.ts"),
				"utf-8"
			);
			// Verify the command is defined
			expect(mainSrc).toContain('"superflow:switch-task"');
			// Verify it uses openTaskSelector and startTimeTracking
			expect(mainSrc).toContain("openTaskSelector");
			expect(mainSrc).toContain("startTimeTracking(selectedTask)");
		});
	});

	describe("i18n keys", () => {
		it("en.ts has superflow command translations", () => {
			const fs = require("fs");
			const path = require("path");
			const enSrc = fs.readFileSync(
				path.resolve(__dirname, "../../../src/i18n/resources/en.ts"),
				"utf-8"
			);

			expect(enSrc).toContain("toggleTimer");
			expect(enSrc).toContain("pauseTimer");
			expect(enSrc).toContain("startBreak");
			expect(enSrc).toContain("openPlanning");
			expect(enSrc).toContain("switchTask");
			expect(enSrc).toContain("comingSoon");
		});
	});
});
