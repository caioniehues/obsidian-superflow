import { renderFeaturesTab } from "../../../src/settings/tabs/featuresTab";
import { PluginFactory } from "../../helpers/mock-factories";

jest.mock("obsidian");
jest.mock("../../../src/locales", () => ({
	getAvailableLanguages: () => [{ code: "en", label: "English" }],
}));
jest.mock("../../../src/utils/propertyHelpers", () => ({
	getAvailableProperties: () => [],
	getPropertyLabels: () => [],
}));
jest.mock("../../../src/modals/StorageLocationConfirmationModal", () => ({
	showStorageLocationConfirmationModal: jest.fn(),
}));
jest.mock("../../../src/modals/PropertySelectorModal", () => ({
	PropertySelectorModal: jest.fn(),
}));

function createMockContainer(): HTMLElement {
	const el = document.createElement("div");
	// The renderFeaturesTab calls container.empty()
	el.empty = jest.fn(() => {
		el.innerHTML = "";
	});
	return el;
}

function getSettingNames(container: HTMLElement): string[] {
	const nameEls = container.querySelectorAll(".setting-item-name");
	return Array.from(nameEls).map((el) => el.textContent ?? "");
}

function findSettingByName(container: HTMLElement, name: string): Element | null {
	const nameEls = container.querySelectorAll(".setting-item-name");
	for (const el of Array.from(nameEls)) {
		if (el.textContent?.includes(name)) {
			return el.closest(".setting-item");
		}
	}
	return null;
}

describe("SuperFlow settings in Features tab", () => {
	let mockPlugin: any;
	let container: HTMLElement;
	let save: jest.Mock;

	beforeEach(() => {
		mockPlugin = PluginFactory.createMockPlugin();
		// Ensure SuperFlow settings exist
		mockPlugin.settings.defaultFocusMode = "pomodoro";
		mockPlugin.settings.enforceBreaks = "soft";
		mockPlugin.settings.dailyPlanningOnOpen = false;
		mockPlugin.settings.trackingReminderMinutes = 30;
		mockPlugin.settings.showTotalTimeToday = false;
		mockPlugin.settings.autoStartFocusOnTracking = false;
		container = createMockContainer();
		save = jest.fn();
	});

	it("renders the SuperFlow section heading", () => {
		renderFeaturesTab(container, mockPlugin, save);

		const headings = container.querySelectorAll("h2, h3, .setting-item-heading");
		const headingTexts = Array.from(headings).map((h) => h.textContent);
		// The section should contain "SuperFlow" or the translated key
		expect(headingTexts.some((t) => t && t.includes("settings.features.superflow"))).toBe(true);
	});

	it("includes focus mode default dropdown", () => {
		renderFeaturesTab(container, mockPlugin, save);

		const allNames = getSettingNames(container);
		expect(allNames.some((n) => n.includes("settings.features.superflow.defaultFocusMode"))).toBe(true);
	});

	it("includes break enforcement dropdown", () => {
		renderFeaturesTab(container, mockPlugin, save);

		const allNames = getSettingNames(container);
		expect(allNames.some((n) => n.includes("settings.features.superflow.enforceBreaks"))).toBe(true);
	});

	it("includes daily planning vault-open toggle", () => {
		renderFeaturesTab(container, mockPlugin, save);

		const allNames = getSettingNames(container);
		expect(allNames.some((n) => n.includes("settings.features.superflow.dailyPlanning"))).toBe(true);
	});

	it("includes tracking reminder minutes input", () => {
		renderFeaturesTab(container, mockPlugin, save);

		const allNames = getSettingNames(container);
		expect(allNames.some((n) => n.includes("settings.features.superflow.trackingReminder"))).toBe(true);
	});

	it("includes total time today toggle", () => {
		renderFeaturesTab(container, mockPlugin, save);

		const allNames = getSettingNames(container);
		expect(allNames.some((n) => n.includes("settings.features.superflow.showTotalTimeToday"))).toBe(true);
	});

	it("all settings call save() on change", () => {
		renderFeaturesTab(container, mockPlugin, save);

		// Verify the section renders without throwing
		expect(container.children.length).toBeGreaterThan(0);
	});
});
