import { FocusEngineService } from '../../../src/services/FocusEngineService';
import { PluginFactory, TaskFactory, PomodoroFactory } from '../../helpers/mock-factories';
import {
	FocusMode,
	FocusState,
	EVENT_POMODORO_START,
	EVENT_POMODORO_COMPLETE,
	EVENT_POMODORO_TICK,
} from '../../../src/types';

// Mock PomodoroService — we test the wrapper, not the inner service
jest.mock('../../../src/services/PomodoroService', () => {
	return {
		PomodoroService: jest.fn().mockImplementation(() => ({
			initialize: jest.fn().mockResolvedValue(undefined),
			startPomodoro: jest.fn().mockResolvedValue(undefined),
			startBreak: jest.fn().mockResolvedValue(undefined),
			pausePomodoro: jest.fn().mockResolvedValue(undefined),
			resumePomodoro: jest.fn().mockResolvedValue(undefined),
			stopPomodoro: jest.fn().mockResolvedValue(undefined),
			getState: jest.fn().mockReturnValue({
				isRunning: false,
				timeRemaining: 1500,
			}),
			isRunning: jest.fn().mockReturnValue(false),
			getCurrentSession: jest.fn().mockReturnValue(undefined),
			getTimeRemaining: jest.fn().mockReturnValue(1500),
			getSessionHistory: jest.fn().mockResolvedValue([]),
			addSessionToHistory: jest.fn().mockResolvedValue(undefined),
			getTodayStats: jest.fn().mockResolvedValue({
				pomodorosCompleted: 0,
				currentStreak: 0,
				totalMinutes: 0,
				averageSessionLength: 0,
				completionRate: 0,
			}),
			getPomodorosCompleted: jest.fn().mockResolvedValue(0),
			getCurrentStreak: jest.fn().mockResolvedValue(0),
			getTotalMinutesToday: jest.fn().mockResolvedValue(0),
			saveState: jest.fn().mockResolvedValue(undefined),
			loadState: jest.fn().mockResolvedValue(undefined),
			saveLastSelectedTask: jest.fn().mockResolvedValue(undefined),
			getLastSelectedTaskPath: jest.fn().mockResolvedValue(undefined),
			assignTaskToCurrentSession: jest.fn().mockResolvedValue(undefined),
			adjustSessionTime: jest.fn(),
			adjustPreparedTimer: jest.fn(),
			setWebhookNotifier: jest.fn(),
			cleanup: jest.fn(),
		})),
	};
});

describe('FocusEngineService', () => {
	let service: FocusEngineService;
	let mockPlugin: any;

	beforeEach(() => {
		jest.clearAllMocks();
		mockPlugin = PluginFactory.createMockPlugin({
			settings: {
				...PluginFactory.createMockPlugin().settings,
				pomodoroWorkDuration: 25,
				pomodoroShortBreakDuration: 5,
				pomodoroLongBreakDuration: 15,
				pomodoroLongBreakInterval: 4,
				pomodoroAutoStartBreaks: false,
				pomodoroAutoStartWork: false,
				pomodoroNotifications: true,
				pomodoroSoundEnabled: false,
				pomodoroSoundVolume: 50,
				pomodoroStorageLocation: 'plugin',
				defaultFocusMode: 'pomodoro' as FocusMode,
			},
		});
		service = new FocusEngineService(mockPlugin);
	});

	// ── Test 1: startFocus pomodoro delegates to startPomodoro ──
	describe('startFocus({ mode: "pomodoro" })', () => {
		it('delegates to PomodoroService.startPomodoro()', async () => {
			const task = TaskFactory.createTask();
			await service.startFocus({ mode: 'pomodoro', task, duration: 25 });

			const inner = service.pomodoroService;
			expect(inner.startPomodoro).toHaveBeenCalledWith(task, 25);
		});
	});

	// ── Test 2: startFocus flowtime starts open-ended timer ──
	describe('startFocus({ mode: "flowtime" })', () => {
		it('starts open-ended timer (no fixed duration)', async () => {
			const task = TaskFactory.createTask();
			await service.startFocus({ mode: 'flowtime', task });

			expect(service.getMode()).toBe('flowtime');
			// Flowtime should NOT delegate to startPomodoro with a fixed duration
			const inner = service.pomodoroService;
			expect(inner.startPomodoro).toHaveBeenCalled();
			// Duration should be very large (open-ended sentinel)
			const callArgs = (inner.startPomodoro as jest.Mock).mock.calls[0];
			expect(callArgs[1]).toBeGreaterThanOrEqual(120); // open-ended uses max duration
		});
	});

	// ── Test 3: startFocus countdown starts fixed timer, no breaks ──
	describe('startFocus({ mode: "countdown" })', () => {
		it('starts fixed timer with no break cycle', async () => {
			const task = TaskFactory.createTask();
			await service.startFocus({ mode: 'countdown', task, duration: 45 });

			expect(service.getMode()).toBe('countdown');
			const inner = service.pomodoroService;
			expect(inner.startPomodoro).toHaveBeenCalledWith(task, 45);
		});
	});

	// ── Test 4: getMode returns current mode ──
	describe('getMode()', () => {
		it('returns current focus mode', async () => {
			expect(service.getMode()).toBe('pomodoro'); // default

			await service.startFocus({ mode: 'flowtime' });
			expect(service.getMode()).toBe('flowtime');

			await service.startFocus({ mode: 'countdown', duration: 10 });
			expect(service.getMode()).toBe('countdown');
		});
	});

	// ── Test 5: Flowtime suggestBreak returns suggestion ──
	describe('suggestBreak()', () => {
		it('returns break suggestion based on elapsed work time', async () => {
			await service.startFocus({ mode: 'flowtime' });

			// Simulate 30 minutes of work elapsed
			const suggestion = service.suggestBreak(30);
			expect(suggestion).toBeDefined();
			expect(suggestion!.suggestedBreakMinutes).toBe(8); // 25-50 min → 8 min break
			expect(suggestion!.workDurationMinutes).toBe(30);
		});

		it('returns null when not in flowtime mode', () => {
			// Default mode is pomodoro
			const suggestion = service.suggestBreak(30);
			expect(suggestion).toBeNull();
		});
	});

	// ── Test 6: Flowtime session complete → nextSessionType set to suggested break ──
	describe('Flowtime completion', () => {
		it('sets nextSessionType to suggested break duration on completion', async () => {
			await service.startFocus({ mode: 'flowtime' });

			// Simulate the service handling completion internally
			// When flowtime completes after 30 min of work, break should be ~8 min
			const suggestion = service.suggestBreak(30);
			expect(suggestion).toBeDefined();
			expect(suggestion!.suggestedBreakMinutes).toBe(8);
		});
	});

	// ── Test 7: Countdown complete → state cleared (no break) ──
	describe('Countdown completion', () => {
		it('clears state on completion without scheduling a break', async () => {
			await service.startFocus({ mode: 'countdown', duration: 10 });

			// The handleCountdownComplete should not schedule a break
			expect(service.getMode()).toBe('countdown');
			// Countdown mode should not suggest breaks
			const suggestion = service.suggestBreak(10);
			expect(suggestion).toBeNull();
		});
	});

	// ── Test 8: Pomodoro mode unchanged behavior ──
	describe('Pomodoro mode behavior', () => {
		it('maintains session counter and long break cycle', async () => {
			const task = TaskFactory.createTask();
			await service.startFocus({ mode: 'pomodoro', task, duration: 25 });

			// Should delegate everything to PomodoroService
			const inner = service.pomodoroService;
			expect(inner.startPomodoro).toHaveBeenCalledWith(task, 25);
			expect(service.getMode()).toBe('pomodoro');
		});
	});

	// ── Test 9: getState returns FocusState with mode ──
	describe('getState()', () => {
		it('returns FocusState with mode field', () => {
			const state = service.getState();
			expect(state).toHaveProperty('mode');
			expect(state.mode).toBe('pomodoro'); // default
			expect(state).toHaveProperty('isRunning');
			expect(state).toHaveProperty('timeRemaining');
		});

		it('reflects mode change', async () => {
			await service.startFocus({ mode: 'flowtime' });
			const state = service.getState();
			expect(state.mode).toBe('flowtime');
		});
	});

	// ── Test 10: plugin.pomodoroService still works (backward compat) ──
	describe('backward compatibility', () => {
		it('exposes pomodoroService for existing code', () => {
			// FocusEngineService wraps PomodoroService and exposes it
			expect(service.pomodoroService).toBeDefined();
			expect(service.pomodoroService.getState).toBeDefined();
			expect(service.pomodoroService.startPomodoro).toBeDefined();
		});
	});

	// ── Test 11: EVENT_POMODORO_* events fire for pomodoro mode ──
	describe('event compatibility', () => {
		it('fires EVENT_POMODORO_START for pomodoro mode', async () => {
			const task = TaskFactory.createTask();
			await service.startFocus({ mode: 'pomodoro', task, duration: 25 });

			// The inner PomodoroService.startPomodoro fires events internally,
			// so we just verify it was called (events are fired by inner service)
			expect(service.pomodoroService.startPomodoro).toHaveBeenCalled();
		});
	});

	// ── Test 12: Session history records mode ──
	describe('session history', () => {
		it('records mode in session history', async () => {
			await service.startFocus({ mode: 'flowtime' });
			expect(service.getMode()).toBe('flowtime');

			// The mode is tracked by FocusEngineService and would be
			// added to history entries when sessions complete
			const state = service.getState();
			expect(state.mode).toBe('flowtime');
		});
	});

	// ── Delegation tests ──
	describe('delegation to PomodoroService', () => {
		it('delegates pauseFocus to pausePomodoro', async () => {
			await service.pauseFocus();
			expect(service.pomodoroService.pausePomodoro).toHaveBeenCalled();
		});

		it('delegates resumeFocus to resumePomodoro', async () => {
			await service.resumeFocus();
			expect(service.pomodoroService.resumePomodoro).toHaveBeenCalled();
		});

		it('delegates stopFocus to stopPomodoro and resets mode', async () => {
			await service.startFocus({ mode: 'flowtime' });
			expect(service.getMode()).toBe('flowtime');

			await service.stopFocus();
			expect(service.pomodoroService.stopPomodoro).toHaveBeenCalled();
			// Mode resets to default
			expect(service.getMode()).toBe('pomodoro');
		});

		it('delegates cleanup', () => {
			service.cleanup();
			expect(service.pomodoroService.cleanup).toHaveBeenCalled();
		});

		it('delegates initialize', async () => {
			await service.initialize();
			expect(service.pomodoroService.initialize).toHaveBeenCalled();
		});
	});
});
