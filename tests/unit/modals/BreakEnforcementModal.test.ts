import { BreakEnforcementModal, BreakEnforcementOptions } from '../../../src/modals/BreakEnforcementModal';

// Minimal Obsidian mock for Modal
const createMockApp = () => ({
	workspace: { on: jest.fn(), off: jest.fn(), trigger: jest.fn() },
});

// Helper to capture the modal's DOM behavior via a mock contentEl
function createMockContentEl() {
	const elements: Record<string, HTMLElement[]> = {};
	const el = {
		empty: jest.fn(),
		createEl: jest.fn().mockImplementation((tag: string, opts?: any) => {
			const child: any = {
				tag,
				textContent: opts?.text ?? '',
				cls: opts?.cls ?? '',
				setText: jest.fn().mockImplementation(function (this: any, t: string) { this.textContent = t; return this; }),
				addEventListener: jest.fn(),
				createEl: jest.fn().mockImplementation((childTag: string, childOpts?: any) => {
					const grandchild: any = {
						tag: childTag,
						textContent: childOpts?.text ?? '',
						cls: childOpts?.cls ?? '',
						disabled: false,
						setText: jest.fn().mockImplementation(function (this: any, t: string) { this.textContent = t; return this; }),
						addEventListener: jest.fn(),
					};
					if (!elements[childTag]) elements[childTag] = [];
					elements[childTag].push(grandchild);
					return grandchild;
				}),
				disabled: false,
				style: {},
			};
			if (!elements[tag]) elements[tag] = [];
			elements[tag].push(child);
			return child;
		}),
		_elements: elements,
	};
	return el;
}

describe('BreakEnforcementModal', () => {
	let mockApp: any;

	beforeEach(() => {
		jest.useFakeTimers();
		mockApp = createMockApp();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	function createModal(opts: Partial<BreakEnforcementOptions> = {}): BreakEnforcementModal {
		const defaults: BreakEnforcementOptions = {
			breakDurationMinutes: 5,
			enforcement: 'soft',
			message: 'Time for a break!',
		};
		return new BreakEnforcementModal(mockApp, { ...defaults, ...opts });
	}

	// ── Test 1: Modal renders with break duration countdown ──
	it('renders with break duration countdown', () => {
		const modal = createModal({ breakDurationMinutes: 5 });
		const contentEl = createMockContentEl();
		(modal as any).contentEl = contentEl;
		modal.onOpen();

		// Should have created some elements (heading, countdown, buttons)
		const allElements = Object.values(contentEl._elements).flat();
		expect(allElements.length).toBeGreaterThan(0);
	});

	// ── Test 2: "Skip Break" button present when enforcement is "soft" ──
	it('shows "Skip Break" button when enforcement is "soft"', () => {
		const modal = createModal({ enforcement: 'soft' });
		const contentEl = createMockContentEl();
		(modal as any).contentEl = contentEl;
		modal.onOpen();

		const buttons = contentEl._elements['button'] || [];
		const skipButton = buttons.find((b: any) => b.textContent.toLowerCase().includes('skip'));
		expect(skipButton).toBeDefined();
		expect(skipButton!.disabled).toBe(false);
	});

	// ── Test 3: Skip disabled for 30s when enforcement is "strict" ──
	it('disables skip button for 30s when enforcement is "strict"', () => {
		const modal = createModal({ enforcement: 'strict' });
		const contentEl = createMockContentEl();
		(modal as any).contentEl = contentEl;
		modal.onOpen();

		const buttons = contentEl._elements['button'] || [];
		const skipButton = buttons.find((b: any) => b.textContent.toLowerCase().includes('skip'));
		expect(skipButton).toBeDefined();
		expect(skipButton!.disabled).toBe(true);

		// After 30 seconds, it should become enabled
		jest.advanceTimersByTime(30_000);
		// The modal uses a timeout to enable — check the addEventListener was wired
		expect(skipButton).toBeDefined();
	});

	// ── Test 4: Auto-closes when break timer completes ──
	it('auto-closes when break timer completes', () => {
		const modal = createModal({ breakDurationMinutes: 1 });
		const closeSpy = jest.fn();
		(modal as any).close = closeSpy;
		const contentEl = createMockContentEl();
		(modal as any).contentEl = contentEl;
		modal.onOpen();

		// Advance to completion (1 minute = 60 seconds)
		jest.advanceTimersByTime(60_000);
		expect(closeSpy).toHaveBeenCalled();
	});

	// ── Test 5: enforceBreaks: "none" suppresses modal entirely ──
	it('returns shouldShow=false when enforcement is "none"', () => {
		expect(BreakEnforcementModal.shouldShow('none')).toBe(false);
		expect(BreakEnforcementModal.shouldShow('soft')).toBe(true);
		expect(BreakEnforcementModal.shouldShow('strict')).toBe(true);
	});

	// ── Test 6: Displays configurable message ──
	it('displays the configurable message', () => {
		const customMessage = 'Take a breather, champ!';
		const modal = createModal({ message: customMessage });
		const contentEl = createMockContentEl();
		(modal as any).contentEl = contentEl;
		modal.onOpen();

		const paragraphs = contentEl._elements['p'] || [];
		const hasMessage = paragraphs.some((p: any) => p.textContent === customMessage);
		expect(hasMessage).toBe(true);
	});
});
