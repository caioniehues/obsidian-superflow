import { DailySummaryView } from '../../../src/views/DailySummaryView';
import { PluginFactory, TaskFactory } from '../../helpers/mock-factories';
import { DAILY_SUMMARY_VIEW_TYPE, EVENT_TASK_UPDATED } from '../../../src/types';

// Mock WorkspaceLeaf
const createMockLeaf = () => ({
  view: null as any,
});

describe('DailySummaryView', () => {
  let view: DailySummaryView;
  let mockPlugin: ReturnType<typeof PluginFactory.createMockPlugin>;
  let mockLeaf: ReturnType<typeof createMockLeaf>;

  beforeEach(() => {
    mockPlugin = PluginFactory.createMockPlugin();
    // Add onReady to mock plugin
    (mockPlugin as any).onReady = jest.fn().mockResolvedValue(undefined);
    // Add pomodoroService
    (mockPlugin as any).pomodoroService = {
      getTodayStats: jest.fn().mockResolvedValue({
        pomodorosCompleted: 0,
        currentStreak: 0,
        totalMinutes: 0,
        averageSessionLength: 0,
        completionRate: 0,
      }),
    };
    mockLeaf = createMockLeaf();
    view = new DailySummaryView(mockLeaf as any, mockPlugin as any);
    // Provide a contentEl for rendering
    (view as any).contentEl = document.createElement('div');
  });

  it('should return correct view type', () => {
    expect(view.getViewType()).toBe(DAILY_SUMMARY_VIEW_TYPE);
  });

  it('should return "Daily Summary" as display text', () => {
    expect(view.getDisplayText()).toBe('Daily Summary');
  });

  it('should count tasks completed today', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tasks = [
      TaskFactory.createTask({
        title: 'Done today',
        status: 'done',
        completedDate: today,
        path: '/tasks/done-today.md',
      }),
      TaskFactory.createTask({
        title: 'Still open',
        status: 'open',
        path: '/tasks/open.md',
      }),
      TaskFactory.createTask({
        title: 'Done yesterday',
        status: 'done',
        completedDate: '2020-01-01',
        path: '/tasks/done-yesterday.md',
      }),
    ];

    mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
    mockPlugin.statusManager.isCompletedStatus.mockImplementation(
      (s: string) => s === 'done'
    );

    const summary = await view.computeDailySummary();

    expect(summary.tasksCompletedToday).toBe(1);
  });

  it('should compute total time tracked today', async () => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(2, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(3, 0, 0, 0);

    const tasks = [
      TaskFactory.createTask({
        title: 'Worked on today',
        path: '/tasks/worked.md',
        timeEntries: [
          {
            startTime: todayStart.toISOString(),
            endTime: todayEnd.toISOString(),
          },
        ],
      }),
    ];

    mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(false);

    const summary = await view.computeDailySummary();

    expect(summary.totalMinutesToday).toBe(60);
  });

  it('should report focus sessions completed today', async () => {
    (mockPlugin as any).pomodoroService.getTodayStats.mockResolvedValue({
      pomodorosCompleted: 5,
      currentStreak: 2,
      totalMinutes: 125,
      averageSessionLength: 25,
      completionRate: 80,
    });

    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);

    const summary = await view.computeDailySummary();

    expect(summary.focusSessionsCompleted).toBe(5);
  });

  it('should provide per-task breakdown with task name and time', async () => {
    const now = new Date();
    const start1 = new Date(now);
    start1.setHours(1, 0, 0, 0);
    const end1 = new Date(now);
    end1.setHours(2, 0, 0, 0);

    const start2 = new Date(now);
    start2.setHours(3, 0, 0, 0);
    const end2 = new Date(now);
    end2.setHours(3, 30, 0, 0);

    const tasks = [
      TaskFactory.createTask({
        title: 'Task A',
        path: '/tasks/a.md',
        timeEntries: [
          { startTime: start1.toISOString(), endTime: end1.toISOString() },
        ],
      }),
      TaskFactory.createTask({
        title: 'Task B',
        path: '/tasks/b.md',
        timeEntries: [
          { startTime: start2.toISOString(), endTime: end2.toISOString() },
        ],
      }),
    ];

    mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(false);

    const summary = await view.computeDailySummary();

    expect(summary.perTaskBreakdown).toHaveLength(2);
    expect(summary.perTaskBreakdown[0].title).toBe('Task A');
    expect(summary.perTaskBreakdown[0].minutes).toBe(60);
    expect(summary.perTaskBreakdown[1].title).toBe('Task B');
    expect(summary.perTaskBreakdown[1].minutes).toBe(30);
  });

  it('should provide per-project breakdown with project and total time', async () => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(1, 0, 0, 0);
    const end = new Date(now);
    end.setHours(2, 0, 0, 0);

    const tasks = [
      TaskFactory.createTask({
        title: 'Task in Project X',
        path: '/tasks/px.md',
        projects: ['[[Project X]]'],
        timeEntries: [
          { startTime: start.toISOString(), endTime: end.toISOString() },
        ],
      }),
      TaskFactory.createTask({
        title: 'Another Task in Project X',
        path: '/tasks/px2.md',
        projects: ['[[Project X]]'],
        timeEntries: [
          { startTime: start.toISOString(), endTime: end.toISOString() },
        ],
      }),
    ];

    mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(false);

    const summary = await view.computeDailySummary();

    expect(summary.perProjectBreakdown).toHaveLength(1);
    expect(summary.perProjectBreakdown[0].project).toBe('[[Project X]]');
    expect(summary.perProjectBreakdown[0].minutes).toBe(120);
  });

  it('should show "No work recorded today" when day is empty', async () => {
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);

    const summary = await view.computeDailySummary();

    expect(summary.tasksCompletedToday).toBe(0);
    expect(summary.totalMinutesToday).toBe(0);
    expect(summary.focusSessionsCompleted).toBe(0);
    expect(summary.isEmpty).toBe(true);
  });

  it('should register EVENT_TASK_UPDATED listener for live updates', async () => {
    await view.onOpen();

    const onCalls = mockPlugin.emitter.on.mock.calls;
    const hasTaskUpdatedListener = onCalls.some(
      (call: any[]) => call[0] === EVENT_TASK_UPDATED
    );
    expect(hasTaskUpdatedListener).toBe(true);
  });
});
