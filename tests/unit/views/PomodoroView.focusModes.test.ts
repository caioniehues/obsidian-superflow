/**
 * Tests for focus mode UI in PomodoroView.
 *
 * These test the FocusModeSelector component that gets embedded in PomodoroView.
 * We test the selector logic in isolation since PomodoroView has heavy Obsidian deps.
 */

import {
	FocusModeSelector,
	FocusModeSelectorState,
} from '../../../src/ui/FocusModeSelector';
import { FocusMode } from '../../../src/types';

// Minimal DOM mock helpers
function createMockContainer() {
	const children: any[] = [];
	const el: any = {
		empty: jest.fn(() => { children.length = 0; }),
		createEl: jest.fn((tag: string, opts?: any) => {
			const child: any = {
				tag,
				textContent: opts?.text ?? '',
				cls: opts?.cls ?? '',
				value: opts?.value ?? '',
				type: opts?.type ?? '',
				placeholder: opts?.placeholder ?? '',
				disabled: false,
				style: {},
				children: [] as any[],
				dataset: {},
				addEventListener: jest.fn(),
				addClass: jest.fn((c: string) => { child.cls += ` ${c}`; }),
				removeClass: jest.fn((c: string) => { child.cls = child.cls.replace(c, '').trim(); }),
				hasClass: jest.fn((c: string) => child.cls.includes(c)),
				createEl: jest.fn((childTag: string, childOpts?: any) => {
					const grandchild: any = {
						tag: childTag,
						textContent: childOpts?.text ?? '',
						cls: childOpts?.cls ?? '',
						value: childOpts?.value ?? '',
						disabled: false,
						selected: false,
						style: {},
						dataset: {},
						children: [] as any[],
						addEventListener: jest.fn(),
						addClass: jest.fn(),
						removeClass: jest.fn(),
						createEl: jest.fn().mockReturnThis(),
					};
					child.children.push(grandchild);
					return grandchild;
				}),
			};
			children.push(child);
			return child;
		}),
		_children: children,
	};
	return el;
}

describe('FocusModeSelector', () => {
	let container: ReturnType<typeof createMockContainer>;
	let onModeChange: jest.Mock;

	beforeEach(() => {
		container = createMockContainer();
		onModeChange = jest.fn();
	});

	// ── Test 1: Mode selector shows 3 options ──
	it('renders 3 mode options: Pomodoro, Flowtime, Countdown', () => {
		const selector = new FocusModeSelector({
			container,
			currentMode: 'pomodoro',
			onModeChange,
		});
		selector.render();

		// Should have created elements for 3 modes
		const state = selector.getState();
		expect(state.availableModes).toEqual(['pomodoro', 'flowtime', 'countdown']);
		expect(state.currentMode).toBe('pomodoro');
	});

	// ── Test 2: Flowtime hides circular progress (shows elapsed counting up) ──
	it('reports showCircularProgress=false for flowtime mode', () => {
		const selector = new FocusModeSelector({
			container,
			currentMode: 'flowtime',
			onModeChange,
		});
		selector.render();

		const state = selector.getState();
		expect(state.showCircularProgress).toBe(false);
		expect(state.showElapsedTime).toBe(true);
	});

	// ── Test 3: Countdown shows duration input ──
	it('reports showDurationInput=true for countdown mode', () => {
		const selector = new FocusModeSelector({
			container,
			currentMode: 'countdown',
			onModeChange,
		});
		selector.render();

		const state = selector.getState();
		expect(state.showDurationInput).toBe(true);
	});

	// ── Test 4: Mode persists through re-renders ──
	it('persists mode through re-renders', () => {
		const selector = new FocusModeSelector({
			container,
			currentMode: 'flowtime',
			onModeChange,
		});
		selector.render();

		expect(selector.getState().currentMode).toBe('flowtime');

		// Re-render
		selector.render();
		expect(selector.getState().currentMode).toBe('flowtime');
	});

	// ── Test 5: Session counter displays for all modes ──
	it('reports showSessionCounter=true for all modes', () => {
		const modes: FocusMode[] = ['pomodoro', 'flowtime', 'countdown'];
		for (const mode of modes) {
			const selector = new FocusModeSelector({
				container,
				currentMode: mode,
				onModeChange,
			});
			selector.render();
			expect(selector.getState().showSessionCounter).toBe(true);
		}
	});

	// ── Test 6: Break suggestion shows in Flowtime after work session ──
	it('reports showBreakSuggestion=true only for flowtime', () => {
		const flowtimeSelector = new FocusModeSelector({
			container,
			currentMode: 'flowtime',
			onModeChange,
		});
		flowtimeSelector.render();
		expect(flowtimeSelector.getState().showBreakSuggestion).toBe(true);

		const pomodoroSelector = new FocusModeSelector({
			container,
			currentMode: 'pomodoro',
			onModeChange,
		});
		pomodoroSelector.render();
		expect(pomodoroSelector.getState().showBreakSuggestion).toBe(false);
	});

	// ── Mode change callback ──
	it('calls onModeChange when mode is changed', () => {
		const selector = new FocusModeSelector({
			container,
			currentMode: 'pomodoro',
			onModeChange,
		});
		selector.render();

		selector.setMode('flowtime');
		expect(onModeChange).toHaveBeenCalledWith('flowtime');
		expect(selector.getState().currentMode).toBe('flowtime');
	});

	// ── Pomodoro mode state ──
	it('shows circular progress and hides duration input for pomodoro', () => {
		const selector = new FocusModeSelector({
			container,
			currentMode: 'pomodoro',
			onModeChange,
		});
		selector.render();

		const state = selector.getState();
		expect(state.showCircularProgress).toBe(true);
		expect(state.showDurationInput).toBe(false);
		expect(state.showElapsedTime).toBe(false);
	});
});
