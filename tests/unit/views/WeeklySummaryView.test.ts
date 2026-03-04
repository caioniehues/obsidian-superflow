import { WeeklySummaryView } from '../../../src/views/WeeklySummaryView';
import { PluginFactory, TaskFactory } from '../../helpers/mock-factories';
import { WEEKLY_SUMMARY_VIEW_TYPE } from '../../../src/types';

const createMockLeaf = () => ({ view: null as any });

/**
 * Helper: create a date for a specific day of the current week.
 * dayOffset = 0 is Monday, 1 = Tuesday, …, 6 = Sunday.
 */
function dateThisWeek(dayOffset: number): Date {
  const now = new Date();
  // Get the Monday of this week
  const day = now.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(10, 0, 0, 0);

  const target = new Date(monday);
  target.setDate(monday.getDate() + dayOffset);
  return target;
}

describe('WeeklySummaryView', () => {
  let view: WeeklySummaryView;
  let mockPlugin: ReturnType<typeof PluginFactory.createMockPlugin>;

  beforeEach(() => {
    mockPlugin = PluginFactory.createMockPlugin();
    (mockPlugin as any).onReady = jest.fn().mockResolvedValue(undefined);
    (mockPlugin as any).pomodoroService = {
      getTodayStats: jest.fn().mockResolvedValue({
        pomodorosCompleted: 0,
        currentStreak: 0,
        totalMinutes: 0,
        averageSessionLength: 0,
        completionRate: 0,
      }),
    };

    const mockLeaf = createMockLeaf();
    view = new WeeklySummaryView(mockLeaf as any, mockPlugin as any);
    (view as any).contentEl = document.createElement('div');
  });

  it('should return correct view type', () => {
    expect(view.getViewType()).toBe(WEEKLY_SUMMARY_VIEW_TYPE);
  });

  it('should provide 7-day breakdown (Mon–Sun) with time per day', async () => {
    const monStart = dateThisWeek(0);
    const monEnd = new Date(monStart.getTime() + 60 * 60 * 1000); // +1h

    const wedStart = dateThisWeek(2);
    const wedEnd = new Date(wedStart.getTime() + 30 * 60 * 1000); // +30min

    const tasks = [
      TaskFactory.createTask({
        title: 'Monday task',
        path: '/tasks/mon.md',
        timeEntries: [
          { startTime: monStart.toISOString(), endTime: monEnd.toISOString() },
        ],
      }),
      TaskFactory.createTask({
        title: 'Wednesday task',
        path: '/tasks/wed.md',
        timeEntries: [
          { startTime: wedStart.toISOString(), endTime: wedEnd.toISOString() },
        ],
      }),
    ];

    mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(false);

    const summary = await view.computeWeeklySummary();

    expect(summary.dailyBreakdown).toHaveLength(7);
    // Monday (index 0) should have 60 minutes
    expect(summary.dailyBreakdown[0].minutes).toBe(60);
    // Wednesday (index 2) should have 30 minutes
    expect(summary.dailyBreakdown[2].minutes).toBe(30);
    // Other days should be 0
    expect(summary.dailyBreakdown[1].minutes).toBe(0);
  });

  it('should compute estimate vs actual per project', async () => {
    const start = dateThisWeek(0);
    const end = new Date(start.getTime() + 90 * 60 * 1000); // 90 min

    const tasks = [
      TaskFactory.createTask({
        title: 'Task with estimate',
        path: '/tasks/est.md',
        projects: ['[[Project Alpha]]'],
        timeEstimate: 120, // 120 min estimated
        timeEntries: [
          { startTime: start.toISOString(), endTime: end.toISOString() },
        ],
      }),
    ];

    mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(false);

    const summary = await view.computeWeeklySummary();

    expect(summary.projectComparison).toHaveLength(1);
    expect(summary.projectComparison[0].project).toBe('[[Project Alpha]]');
    expect(summary.projectComparison[0].estimateMinutes).toBe(120);
    expect(summary.projectComparison[0].actualMinutes).toBe(90);
  });

  it('should count tasks completed this week', async () => {
    const todayStr = new Date().toISOString().split('T')[0];

    const tasks = [
      TaskFactory.createTask({
        title: 'Completed this week',
        path: '/tasks/done.md',
        status: 'done',
        completedDate: todayStr,
      }),
      TaskFactory.createTask({
        title: 'Completed long ago',
        path: '/tasks/old.md',
        status: 'done',
        completedDate: '2020-01-01',
      }),
    ];

    mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
    mockPlugin.statusManager.isCompletedStatus.mockImplementation(
      (s: string) => s === 'done'
    );

    const summary = await view.computeWeeklySummary();

    expect(summary.tasksCompletedThisWeek).toBe(1);
  });

  it('should compute efficiency ratio (actual / estimated)', async () => {
    const start = dateThisWeek(1);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 60 min actual

    const tasks = [
      TaskFactory.createTask({
        title: 'Efficient task',
        path: '/tasks/eff.md',
        projects: ['[[Proj]]'],
        timeEstimate: 120, // 120 min estimated
        timeEntries: [
          { startTime: start.toISOString(), endTime: end.toISOString() },
        ],
      }),
    ];

    mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(false);

    const summary = await view.computeWeeklySummary();

    // Efficiency = actual / estimated = 60/120 = 0.5
    expect(summary.projectComparison[0].efficiencyRatio).toBeCloseTo(0.5);
  });

  it('should exclude projects with no time this week', async () => {
    // Task with no time entries at all
    const tasks = [
      TaskFactory.createTask({
        title: 'No time task',
        path: '/tasks/notime.md',
        projects: ['[[Empty Project]]'],
        timeEstimate: 60,
      }),
    ];

    mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(false);

    const summary = await view.computeWeeklySummary();

    expect(summary.projectComparison).toHaveLength(0);
  });

  it('should handle week boundary (week starting on Monday)', async () => {
    const summary = await view.computeWeeklySummary();

    // The first day in dailyBreakdown should be Monday
    expect(summary.dailyBreakdown[0].dayLabel).toBe('Mon');
    expect(summary.dailyBreakdown[6].dayLabel).toBe('Sun');

    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(false);
  });
});
