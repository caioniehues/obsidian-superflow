import { PlanningModal } from '../../../src/modals/PlanningModal';
import { PlanningService } from '../../../src/services/PlanningService';
import { TaskFactory, PluginFactory } from '../../helpers/mock-factories';
import type { App } from 'obsidian';

jest.mock('obsidian');
jest.mock('../../../src/modals/TaskSelectorWithCreateModal', () => ({
  openTaskSelector: jest.fn(),
}));

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('PlanningModal — review-yesterday step', () => {
  let modal: PlanningModal;
  let mockPlugin: any;
  let planningService: PlanningService;

  beforeEach(() => {
    mockPlugin = PluginFactory.createMockPlugin();
    planningService = new PlanningService(mockPlugin);
    // Spy on service methods
    jest.spyOn(planningService, 'moveToToday');
    jest.spyOn(planningService, 'moveToBacklog');
    jest.spyOn(planningService, 'getYesterdayTasks');
    jest.spyOn(planningService, 'nextStep');
  });

  function createAndOpenModal(): PlanningModal {
    modal = new PlanningModal(mockPlugin.app as unknown as App, mockPlugin, planningService);
    modal.open();
    return modal;
  }

  it('opens at step review-yesterday', async () => {
    const yesterday = yesterdayString();
    planningService.startPlanning();
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([
      TaskFactory.createTask({ title: 'A task', scheduled: yesterday, status: 'open', path: '/tasks/a.md' }),
    ]);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(false);

    createAndOpenModal();
    await flushPromises();

    expect(planningService.getState().currentStep).toBe('review-yesterday');
    const headingText = modal.contentEl.textContent;
    expect(headingText).toContain('Yesterday');
  });

  it('shows completed tasks with checkmark indicators', async () => {
    const yesterday = yesterdayString();
    const tasks = [
      TaskFactory.createTask({ title: 'Completed task', scheduled: yesterday, status: 'done', path: '/tasks/a.md' }),
    ];
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
    mockPlugin.statusManager.isCompletedStatus.mockImplementation(
      (s: string) => s === 'done' || s === 'completed'
    );
    planningService.startPlanning();

    createAndOpenModal();
    await flushPromises();

    // Should have a completed task item with check indicator
    const completedSection = modal.contentEl.querySelector('.planning-completed-tasks');
    expect(completedSection).toBeTruthy();
    expect(completedSection!.textContent).toContain('Completed task');
  });

  it('shows incomplete tasks with action buttons', async () => {
    const yesterday = yesterdayString();
    const tasks = [
      TaskFactory.createTask({ title: 'Unfinished task', scheduled: yesterday, status: 'open', path: '/tasks/b.md' }),
    ];
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue(tasks);
    mockPlugin.statusManager.isCompletedStatus.mockImplementation(
      (s: string) => s === 'done' || s === 'completed'
    );
    planningService.startPlanning();

    createAndOpenModal();
    await flushPromises();

    const incompleteSection = modal.contentEl.querySelector('.planning-incomplete-tasks');
    expect(incompleteSection).toBeTruthy();
    expect(incompleteSection!.textContent).toContain('Unfinished task');

    // Should have Move to Today and Move to Backlog buttons
    const buttons = incompleteSection!.querySelectorAll('button');
    const buttonTexts = Array.from(buttons).map(b => b.textContent);
    expect(buttonTexts).toContain('Move to Today');
    expect(buttonTexts).toContain('Move to Backlog');
  });

  it('"Move to Today" calls planningService.moveToToday()', async () => {
    const yesterday = yesterdayString();
    const task = TaskFactory.createTask({ title: 'Move me', scheduled: yesterday, status: 'open', path: '/tasks/b.md' });
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([task]);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(false);
    planningService.startPlanning();

    createAndOpenModal();
    await flushPromises();

    const moveToTodayBtn = findButton(modal.contentEl, 'Move to Today');
    expect(moveToTodayBtn).toBeTruthy();
    moveToTodayBtn!.click();
    await flushPromises();

    expect(planningService.moveToToday).toHaveBeenCalledWith(task);
  });

  it('"Move to Backlog" calls planningService.moveToBacklog()', async () => {
    const yesterday = yesterdayString();
    const task = TaskFactory.createTask({ title: 'Backlog me', scheduled: yesterday, status: 'open', path: '/tasks/c.md' });
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([task]);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(false);
    planningService.startPlanning();

    createAndOpenModal();
    await flushPromises();

    const moveToBacklogBtn = findButton(modal.contentEl, 'Move to Backlog');
    expect(moveToBacklogBtn).toBeTruthy();
    moveToBacklogBtn!.click();
    await flushPromises();

    expect(planningService.moveToBacklog).toHaveBeenCalledWith(task);
  });

  it('"Next" advances to plan-today', async () => {
    const yesterday = yesterdayString();
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([
      TaskFactory.createTask({ title: 'Some task', scheduled: yesterday, status: 'done', path: '/tasks/a.md' }),
    ]);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(true);
    planningService.startPlanning();

    createAndOpenModal();
    await flushPromises();

    const nextBtn = findButton(modal.contentEl, 'Next');
    expect(nextBtn).toBeTruthy();
    nextBtn!.click();
    await flushPromises();

    expect(planningService.getState().currentStep).toBe('plan-today');
  });

  it('empty yesterday shows "Nothing to review" and auto-advances', async () => {
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);
    planningService.startPlanning();

    createAndOpenModal();
    await flushPromises();

    const text = modal.contentEl.textContent;
    expect(text).toContain('Nothing to review');
    expect(planningService.getState().currentStep).toBe('plan-today');
  });
});

// ─── Helpers ──────────────────────────────────────

function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | null {
  const buttons = container.querySelectorAll('button');
  for (const btn of Array.from(buttons)) {
    if (btn.textContent?.trim() === text) {
      return btn as HTMLButtonElement;
    }
  }
  return null;
}
