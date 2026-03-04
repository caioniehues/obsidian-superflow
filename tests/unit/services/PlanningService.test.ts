import { PlanningService } from '../../../src/services/PlanningService';
import { TaskFactory, PluginFactory } from '../../helpers/mock-factories';
import { TaskInfo } from '../../../src/types';

/**
 * Helper to get a YYYY-MM-DD string for today in local time
 */
function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Helper to get a YYYY-MM-DD string for yesterday in local time
 */
function yesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('PlanningService', () => {
  let service: PlanningService;
  let mockPlugin: any;

  beforeEach(() => {
    mockPlugin = PluginFactory.createMockPlugin();
    service = new PlanningService(mockPlugin);
  });

  describe('getYesterdayTasks', () => {
    it('returns tasks with scheduled === yesterday, split into completed and incomplete', async () => {
      const yesterday = yesterdayString();
      const tasks: TaskInfo[] = [
        TaskFactory.createTask({ title: 'Done yesterday', scheduled: yesterday, status: 'done', path: '/tasks/a.md' }),
        TaskFactory.createTask({ title: 'Still open', scheduled: yesterday, status: 'open', path: '/tasks/b.md' }),
        TaskFactory.createTask({ title: 'Today task', scheduled: todayString(), status: 'open', path: '/tasks/c.md' }),
        TaskFactory.createTask({ title: 'No schedule', status: 'open', path: '/tasks/d.md' }),
      ];

      mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
      mockPlugin.statusManager.isCompletedStatus.mockImplementation(
        (s: string) => s === 'done' || s === 'completed'
      );

      const result = await service.getYesterdayTasks();

      expect(result.completed).toHaveLength(1);
      expect(result.completed[0].title).toBe('Done yesterday');
      expect(result.incomplete).toHaveLength(1);
      expect(result.incomplete[0].title).toBe('Still open');
    });
  });

  describe('getTodayTasks', () => {
    it('returns tasks with scheduled === today', async () => {
      const today = todayString();
      const tasks: TaskInfo[] = [
        TaskFactory.createTask({ title: 'Today 1', scheduled: today, path: '/tasks/a.md' }),
        TaskFactory.createTask({ title: 'Today 2', scheduled: today, path: '/tasks/b.md' }),
        TaskFactory.createTask({ title: 'Yesterday', scheduled: yesterdayString(), path: '/tasks/c.md' }),
        TaskFactory.createTask({ title: 'No date', path: '/tasks/d.md' }),
      ];

      mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);

      const result = await service.getTodayTasks();

      expect(result).toHaveLength(2);
      expect(result.map(t => t.title)).toEqual(['Today 1', 'Today 2']);
    });
  });

  describe('getBacklog', () => {
    it('returns tasks with no scheduled date and status not completed', async () => {
      const tasks: TaskInfo[] = [
        TaskFactory.createTask({ title: 'Backlog 1', status: 'open', path: '/tasks/a.md' }),
        TaskFactory.createTask({ title: 'Backlog 2', status: 'in-progress', path: '/tasks/b.md' }),
        TaskFactory.createTask({ title: 'Done no date', status: 'done', path: '/tasks/c.md' }),
        TaskFactory.createTask({ title: 'Scheduled', scheduled: todayString(), status: 'open', path: '/tasks/d.md' }),
      ];

      mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
      mockPlugin.statusManager.isCompletedStatus.mockImplementation(
        (s: string) => s === 'done' || s === 'completed'
      );

      const result = await service.getBacklog();

      expect(result).toHaveLength(2);
      expect(result.map(t => t.title)).toEqual(['Backlog 1', 'Backlog 2']);
    });
  });

  describe('moveToToday', () => {
    it('sets scheduled to today\'s date string via taskService.updateTask', async () => {
      const task = TaskFactory.createTask({ title: 'Move me', path: '/tasks/a.md' });
      mockPlugin.cacheManager.getTaskInfo.mockResolvedValue(task);

      await service.moveToToday(task);

      expect(mockPlugin.taskService.updateTask).toHaveBeenCalledWith(
        task,
        { scheduled: todayString() }
      );
    });
  });

  describe('moveToBacklog', () => {
    it('clears the scheduled field via taskService.updateTask', async () => {
      const task = TaskFactory.createTask({ title: 'Unschedule me', scheduled: todayString(), path: '/tasks/a.md' });
      mockPlugin.cacheManager.getTaskInfo.mockResolvedValue(task);

      await service.moveToBacklog(task);

      expect(mockPlugin.taskService.updateTask).toHaveBeenCalledWith(
        task,
        { scheduled: undefined }
      );
    });
  });

  describe('getUnestimatedTasks', () => {
    it('returns today\'s tasks with no timeEstimate', async () => {
      const today = todayString();
      const tasks: TaskInfo[] = [
        TaskFactory.createTask({ title: 'Estimated', scheduled: today, timeEstimate: 30, path: '/tasks/a.md' }),
        TaskFactory.createTask({ title: 'Unestimated', scheduled: today, path: '/tasks/b.md' }),
        TaskFactory.createTask({ title: 'Also unestimated', scheduled: today, timeEstimate: undefined, path: '/tasks/c.md' }),
      ];

      mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);

      const result = await service.getUnestimatedTasks();

      expect(result).toHaveLength(2);
      expect(result.map(t => t.title)).toEqual(['Unestimated', 'Also unestimated']);
    });
  });

  describe('isActive state', () => {
    it('starts as false', () => {
      expect(service.getState().isActive).toBe(false);
    });

    it('becomes true after startPlanning()', () => {
      service.startPlanning();
      expect(service.getState().isActive).toBe(true);
    });
  });

  describe('step progression', () => {
    it('follows review-yesterday → plan-today → estimate → done', () => {
      service.startPlanning();
      expect(service.getState().currentStep).toBe('review-yesterday');

      service.nextStep();
      expect(service.getState().currentStep).toBe('plan-today');

      service.nextStep();
      expect(service.getState().currentStep).toBe('estimate');

      service.nextStep();
      expect(service.getState().currentStep).toBe('done');
    });
  });

  describe('nextStep', () => {
    it('advances through steps', () => {
      service.startPlanning();

      const steps = ['review-yesterday', 'plan-today', 'estimate', 'done'] as const;
      for (const expected of steps) {
        expect(service.getState().currentStep).toBe(expected);
        service.nextStep();
      }
    });

    it('does not advance past done', () => {
      service.startPlanning();
      service.nextStep(); // plan-today
      service.nextStep(); // estimate
      service.nextStep(); // done
      service.nextStep(); // still done

      expect(service.getState().currentStep).toBe('done');
    });
  });

  describe('finishPlanning', () => {
    it('sets isActive to false and resets step to review-yesterday', () => {
      service.startPlanning();
      service.nextStep(); // plan-today
      service.nextStep(); // estimate

      service.finishPlanning();

      expect(service.getState().isActive).toBe(false);
      expect(service.getState().currentStep).toBe('review-yesterday');
    });
  });
});
