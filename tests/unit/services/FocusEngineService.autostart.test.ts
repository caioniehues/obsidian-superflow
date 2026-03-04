import { FocusEngineService } from '../../../src/services/FocusEngineService';
import { PluginFactory, TaskFactory } from '../../helpers/mock-factories';
import { FocusMode, TaskInfo } from '../../../src/types';

// Mock PomodoroService
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

describe('FocusEngineService — auto-start on tracking', () => {
	let service: FocusEngineService;
	let mockPlugin: any;

	function createService(settingsOverrides: Record<string, any> = {}) {
		mockPlugin = PluginFactory.createMockPlugin({
			settings: {
				...PluginFactory.createMockPlugin().settings,
				pomodoroWorkDuration: 25,
				defaultFocusMode: 'pomodoro' as FocusMode,
				autoStartFocusOnTracking: false,
				...settingsOverrides,
			},
		});
		service = new FocusEngineService(mockPlugin);
		return service;
	}

	// ── Test 1: Setting enabled + tracking starts → focus session starts ──
	it('starts focus session when tracking starts and setting is enabled', async () => {
		createService({ autoStartFocusOnTracking: true });
		const task = TaskFactory.createTask();

		await service.handleTimeTrackingStarted(task);

		expect(service.pomodoroService.startPomodoro).toHaveBeenCalled();
	});

	// ── Test 2: Focus already running → no double-start ──
	it('does not double-start if focus is already running', async () => {
		createService({ autoStartFocusOnTracking: true });
		(service.pomodoroService.getState as jest.Mock).mockReturnValue({
			isRunning: true,
			timeRemaining: 1200,
			currentSession: { id: 'existing' },
		});

		const task = TaskFactory.createTask();
		await service.handleTimeTrackingStarted(task);

		expect(service.pomodoroService.startPomodoro).not.toHaveBeenCalled();
	});

	// ── Test 3: Setting disabled → no auto-start ──
	it('does not auto-start when setting is disabled', async () => {
		createService({ autoStartFocusOnTracking: false });
		const task = TaskFactory.createTask();

		await service.handleTimeTrackingStarted(task);

		expect(service.pomodoroService.startPomodoro).not.toHaveBeenCalled();
	});

	// ── Test 4: Uses default focus mode from settings ──
	it('uses default focus mode from settings', async () => {
		createService({
			autoStartFocusOnTracking: true,
			defaultFocusMode: 'flowtime',
		});
		const task = TaskFactory.createTask();

		await service.handleTimeTrackingStarted(task);

		expect(service.getMode()).toBe('flowtime');
		expect(service.pomodoroService.startPomodoro).toHaveBeenCalled();
	});

	// ── Test 5: Focus linked to tracked task ──
	it('links focus session to the tracked task', async () => {
		createService({ autoStartFocusOnTracking: true });
		const task = TaskFactory.createTask({ path: '/tasks/my-task.md' });

		await service.handleTimeTrackingStarted(task);

		const callArgs = (service.pomodoroService.startPomodoro as jest.Mock).mock.calls[0];
		expect(callArgs[0]).toEqual(task);
	});
});
