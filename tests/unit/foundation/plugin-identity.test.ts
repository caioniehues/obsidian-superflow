import * as fs from "fs";
import * as path from "path";

describe("P0.1 — Plugin Identity: Obsidian SuperFlow", () => {
	const rootDir = path.resolve(__dirname, "../../..");

	describe("manifest.json", () => {
		let manifest: Record<string, unknown>;

		beforeAll(() => {
			const raw = fs.readFileSync(path.join(rootDir, "manifest.json"), "utf-8");
			manifest = JSON.parse(raw);
		});

		it("has id 'obsidian-superflow'", () => {
			expect(manifest.id).toBe("obsidian-superflow");
		});

		it("has name 'Obsidian SuperFlow'", () => {
			expect(manifest.name).toBe("Obsidian SuperFlow");
		});
	});

	describe("Backward compatibility — Bases view IDs unchanged", () => {
		it("registration.ts uses tasknotesTaskList, tasknotesKanban, tasknotesCalendar, tasknotesMiniCalendar", () => {
			const registrationSrc = fs.readFileSync(
				path.join(rootDir, "src/bases/registration.ts"),
				"utf-8"
			);
			expect(registrationSrc).toContain('"tasknotesTaskList"');
			expect(registrationSrc).toContain('"tasknotesKanban"');
			expect(registrationSrc).toContain('"tasknotesCalendar"');
			expect(registrationSrc).toContain('"tasknotesMiniCalendar"');
		});
	});

	describe("Backward compatibility — ItemView type constants unchanged", () => {
		let typesSrc: string;

		beforeAll(() => {
			typesSrc = fs.readFileSync(
				path.join(rootDir, "src/types.ts"),
				"utf-8"
			);
		});

		it("POMODORO_VIEW_TYPE is 'tasknotes-pomodoro-view'", () => {
			expect(typesSrc).toContain('POMODORO_VIEW_TYPE = "tasknotes-pomodoro-view"');
		});

		it("STATS_VIEW_TYPE is 'tasknotes-stats-view'", () => {
			expect(typesSrc).toContain('STATS_VIEW_TYPE = "tasknotes-stats-view"');
		});

		it("TASK_LIST_VIEW_TYPE is 'tasknotes-task-list-view'", () => {
			expect(typesSrc).toContain('TASK_LIST_VIEW_TYPE = "tasknotes-task-list-view"');
		});

		it("KANBAN_VIEW_TYPE is 'tasknotes-kanban-view'", () => {
			expect(typesSrc).toContain('KANBAN_VIEW_TYPE = "tasknotes-kanban-view"');
		});

		it("AGENDA_VIEW_TYPE is 'tasknotes-agenda-view'", () => {
			expect(typesSrc).toContain('AGENDA_VIEW_TYPE = "tasknotes-agenda-view"');
		});

		it("MINI_CALENDAR_VIEW_TYPE is 'tasknotes-mini-calendar-view'", () => {
			expect(typesSrc).toContain('MINI_CALENDAR_VIEW_TYPE = "tasknotes-mini-calendar-view"');
		});

		it("BASES_CALENDAR_VIEW_ID is 'tasknotesCalendar'", () => {
			expect(typesSrc).toContain('BASES_CALENDAR_VIEW_ID = "tasknotesCalendar"');
		});
	});
});
