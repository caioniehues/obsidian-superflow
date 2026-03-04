import { TrackingReminderService } from '../../../src/services/TrackingReminderService';
import { PluginFactory } from '../../helpers/mock-factories';
import { EVENT_TASK_UPDATED } from '../../../src/types';
import { Notice } from 'obsidian';

describe('TrackingReminderService', () => {
  let service: TrackingReminderService;
  let mockPlugin: ReturnType<typeof PluginFactory.createMockPlugin>;
  let mockStatusBarService: { flash: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    (Notice as jest.Mock).mockClear();

    mockPlugin = PluginFactory.createMockPlugin({
      settings: {
        ...PluginFactory.createMockPlugin().settings,
        trackingReminderMinutes: 30,
      },
    });

    mockStatusBarService = { flash: jest.fn() };

    service = new TrackingReminderService(
      mockPlugin as any,
      mockStatusBarService as any
    );
  });

  afterEach(() => {
    service.destroy();
    jest.useRealTimers();
  });

  it('should not fire reminder when a task is actively tracked', async () => {
    // Simulate an active tracking session
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([
      {
        title: 'Active Task',
        path: '/tasks/active.md',
        status: 'in-progress',
        priority: 'normal',
        archived: false,
        timeEntries: [{ startTime: new Date().toISOString() }], // no endTime = active
      },
    ]);

    service.initialize();

    // Advance past the reminder interval
    jest.advanceTimersByTime(31 * 60 * 1000);
    // Flush async queue (checkIdleState is async)
    await Promise.resolve();

    expect(Notice).not.toHaveBeenCalled();
    expect(mockStatusBarService.flash).not.toHaveBeenCalled();
  });

  it('should fire reminder after trackingReminderMinutes of idle time', async () => {
    // No active tracking sessions
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);

    service.initialize();

    // Advance just under the reminder threshold — no reminder yet
    jest.advanceTimersByTime(29 * 60 * 1000);
    await Promise.resolve();
    expect(Notice).not.toHaveBeenCalled();

    // Advance past the threshold
    jest.advanceTimersByTime(2 * 60 * 1000);
    await Promise.resolve();
    expect(Notice).toHaveBeenCalled();
    expect(mockStatusBarService.flash).toHaveBeenCalled();
  });

  it('should trigger status bar flash and Notice on idle timeout', async () => {
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);

    service.initialize();

    jest.advanceTimersByTime(31 * 60 * 1000);
    await Promise.resolve();

    expect(mockStatusBarService.flash).toHaveBeenCalled();
    expect(Notice).toHaveBeenCalled();
  });

  it('should reset timer when tracking starts (EVENT_TASK_UPDATED)', async () => {
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);

    service.initialize();

    // Advance 20 minutes (not enough for reminder)
    jest.advanceTimersByTime(20 * 60 * 1000);
    await Promise.resolve();
    expect(Notice).not.toHaveBeenCalled();

    // Simulate tracking start by triggering event
    // The service listens for EVENT_TASK_UPDATED and resets the idle timer
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([
      {
        title: 'Active Task',
        path: '/tasks/active.md',
        status: 'in-progress',
        priority: 'normal',
        archived: false,
        timeEntries: [{ startTime: new Date().toISOString() }],
      },
    ]);

    // Get the event handler and call it
    const onCall = mockPlugin.emitter.on.mock.calls.find(
      (call: any[]) => call[0] === EVENT_TASK_UPDATED
    );
    expect(onCall).toBeDefined();
    const handler = onCall![1];
    handler();

    // Advance another 20 minutes (total 40 from start, but timer was reset)
    jest.advanceTimersByTime(20 * 60 * 1000);
    await Promise.resolve();
    // Should NOT fire because tracking is now active
    expect(Notice).not.toHaveBeenCalled();
  });

  it('should reset timer on dismiss', async () => {
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);

    service.initialize();

    // Trigger reminder
    jest.advanceTimersByTime(31 * 60 * 1000);
    await Promise.resolve();
    expect(Notice).toHaveBeenCalledTimes(1);

    // Dismiss resets the timer
    service.dismiss();

    // Advance another 29 minutes — not enough for second reminder
    jest.advanceTimersByTime(29 * 60 * 1000);
    await Promise.resolve();
    expect(Notice).toHaveBeenCalledTimes(1);

    // Advance past threshold again
    jest.advanceTimersByTime(2 * 60 * 1000);
    await Promise.resolve();
    expect(Notice).toHaveBeenCalledTimes(2);
  });

  it('should be disabled when trackingReminderMinutes is 0', async () => {
    mockPlugin.settings.trackingReminderMinutes = 0;
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);

    service = new TrackingReminderService(
      mockPlugin as any,
      mockStatusBarService as any
    );
    service.initialize();

    // Advance way past any threshold
    jest.advanceTimersByTime(120 * 60 * 1000);
    await Promise.resolve();

    expect(Notice).not.toHaveBeenCalled();
    expect(mockStatusBarService.flash).not.toHaveBeenCalled();
  });

  it('should clean up interval and listeners on destroy', async () => {
    service.initialize();

    const offCalls = mockPlugin.emitter.off.mock.calls.length;
    service.destroy();

    // Should have removed event listeners
    expect(mockPlugin.emitter.off.mock.calls.length).toBeGreaterThan(offCalls);

    // After destroy, advancing timers should not trigger anything
    jest.advanceTimersByTime(60 * 60 * 1000);
    await Promise.resolve();
    expect(Notice).not.toHaveBeenCalled();
  });
});
