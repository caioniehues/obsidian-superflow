import { PlanningModal } from '../../../src/modals/PlanningModal';
import { PlanningService } from '../../../src/services/PlanningService';
import { TaskFactory, PluginFactory } from '../../helpers/mock-factories';
import type { App } from 'obsidian';

jest.mock('obsidian');

// Mock the TaskSelectorWithCreateModal so we can control backlog picks
jest.mock('../../../src/modals/TaskSelectorWithCreateModal', () => ({
  openTaskSelector: jest.fn(),
}));

import { openTaskSelector } from '../../../src/modals/TaskSelectorWithCreateModal';
const mockOpenTaskSelector = openTaskSelector as jest.MockedFunction<typeof openTaskSelector>;

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('PlanningModal — plan-today step', () => {
  let modal: PlanningModal;
  let mockPlugin: any;
  let planningService: PlanningService;

  beforeEach(() => {
    mockPlugin = PluginFactory.createMockPlugin();
    planningService = new PlanningService(mockPlugin);
    jest.spyOn(planningService, 'getTodayTasks');
    jest.spyOn(planningService, 'getBacklog');
    jest.spyOn(planningService, 'moveToToday');
    jest.spyOn(planningService, 'nextStep');
    mockOpenTaskSelector.mockReset();
  });

  function advanceToStep(step: 'plan-today' | 'estimate' | 'done'): void {
    planningService.startPlanning();
    const steps = ['review-yesterday', 'plan-today', 'estimate', 'done'] as const;
    const targetIdx = steps.indexOf(step);
    for (let i = 0; i < targetIdx; i++) {
      planningService.nextStep();
    }
  }

  function createAndOpenModal(): PlanningModal {
    modal = new PlanningModal(mockPlugin.app as unknown as App, mockPlugin, planningService);
    modal.open();
    return modal;
  }

  it('shows today\'s tasks from planningService.getTodayTasks()', async () => {
    const today = todayString();
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([
      TaskFactory.createTask({ title: 'Task A', scheduled: today, path: '/tasks/a.md' }),
      TaskFactory.createTask({ title: 'Task B', scheduled: today, path: '/tasks/b.md' }),
    ]);
    advanceToStep('plan-today');

    createAndOpenModal();
    await flushPromises();

    const content = modal.contentEl.textContent;
    expect(content).toContain('Task A');
    expect(content).toContain('Task B');
    expect(content).toContain('Plan Today');
  });

  it('"Add from Backlog" opens a task selector', async () => {
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);
    advanceToStep('plan-today');

    createAndOpenModal();
    await flushPromises();

    const addBtn = findButton(modal.contentEl, 'Add from Backlog');
    expect(addBtn).toBeTruthy();

    // Mock backlog return for when selector is opened
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([
      TaskFactory.createTask({ title: 'Backlog item', status: 'open', path: '/tasks/bl.md' }),
    ]);

    addBtn!.click();
    await flushPromises();

    expect(mockOpenTaskSelector).toHaveBeenCalled();
  });

  it('selected backlog task gets scheduled via planningService.moveToToday()', async () => {
    const backlogTask = TaskFactory.createTask({ title: 'Backlog item', status: 'open', path: '/tasks/bl.md' });
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);
    mockPlugin.statusManager.isCompletedStatus.mockReturnValue(false);
    advanceToStep('plan-today');

    // When openTaskSelector is called, immediately invoke the callback with the task
    mockOpenTaskSelector.mockImplementation((_plugin, _tasks, callback) => {
      callback(backlogTask);
    });

    createAndOpenModal();
    await flushPromises();

    const addBtn = findButton(modal.contentEl, 'Add from Backlog');
    addBtn!.click();
    await flushPromises();

    expect(planningService.moveToToday).toHaveBeenCalledWith(backlogTask);
  });
});

describe('PlanningModal — estimate step', () => {
  let modal: PlanningModal;
  let mockPlugin: any;
  let planningService: PlanningService;

  beforeEach(() => {
    mockPlugin = PluginFactory.createMockPlugin();
    planningService = new PlanningService(mockPlugin);
    jest.spyOn(planningService, 'getUnestimatedTasks');
    jest.spyOn(planningService, 'finishPlanning');
  });

  function advanceToStep(step: 'plan-today' | 'estimate' | 'done'): void {
    planningService.startPlanning();
    const steps = ['review-yesterday', 'plan-today', 'estimate', 'done'] as const;
    const targetIdx = steps.indexOf(step);
    for (let i = 0; i < targetIdx; i++) {
      planningService.nextStep();
    }
  }

  function createAndOpenModal(): PlanningModal {
    modal = new PlanningModal(mockPlugin.app as unknown as App, mockPlugin, planningService);
    modal.open();
    return modal;
  }

  it('shows unestimated tasks from planningService.getUnestimatedTasks()', async () => {
    const today = todayString();
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([
      TaskFactory.createTask({ title: 'Needs estimate', scheduled: today, path: '/tasks/a.md' }),
    ]);
    advanceToStep('estimate');

    createAndOpenModal();
    await flushPromises();

    const content = modal.contentEl.textContent;
    expect(content).toContain('Needs estimate');
    expect(content).toContain('Estimate');
  });

  it('provides inline number input for timeEstimate', async () => {
    const today = todayString();
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([
      TaskFactory.createTask({ title: 'Estimate me', scheduled: today, path: '/tasks/a.md' }),
    ]);
    advanceToStep('estimate');

    createAndOpenModal();
    await flushPromises();

    const input = modal.contentEl.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('saving estimate calls taskService.updateTask()', async () => {
    const today = todayString();
    const task = TaskFactory.createTask({ title: 'Estimate me', scheduled: today, path: '/tasks/a.md' });
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([task]);
    advanceToStep('estimate');

    createAndOpenModal();
    await flushPromises();

    // Fill in the estimate input
    const input = modal.contentEl.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = '30';
    input.dispatchEvent(new Event('change'));

    // Click the save button for this estimate
    const saveBtn = findButton(modal.contentEl, 'Save');
    expect(saveBtn).toBeTruthy();
    saveBtn!.click();
    await flushPromises();

    expect(mockPlugin.taskService.updateTask).toHaveBeenCalledWith(
      task,
      { timeEstimate: 30 }
    );
  });

  it('"Finish" calls planningService.finishPlanning()', async () => {
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);
    advanceToStep('estimate');

    createAndOpenModal();
    await flushPromises();

    // With no unestimated tasks, advance to done step via Next
    const nextBtn = findButton(modal.contentEl, 'Next');
    expect(nextBtn).toBeTruthy();
    nextBtn!.click();
    await flushPromises();

    // Now on done step, click Finish
    const finishBtn = findButton(modal.contentEl, 'Finish');
    expect(finishBtn).toBeTruthy();
    finishBtn!.click();
    await flushPromises();

    expect(planningService.finishPlanning).toHaveBeenCalled();
  });

  it('modal closes after finish', async () => {
    mockPlugin.cacheManager.getAllTasks.mockResolvedValue([]);
    advanceToStep('estimate');

    createAndOpenModal();
    await flushPromises();

    const closeSpy = jest.spyOn(modal, 'close');

    // Advance to done
    const nextBtn = findButton(modal.contentEl, 'Next');
    nextBtn!.click();
    await flushPromises();

    // Finish
    const finishBtn = findButton(modal.contentEl, 'Finish');
    finishBtn!.click();
    await flushPromises();

    expect(closeSpy).toHaveBeenCalled();
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
