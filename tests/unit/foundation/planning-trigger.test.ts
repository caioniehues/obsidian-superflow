import { PlanningService } from '../../../src/services/PlanningService';
import { TaskFactory, PluginFactory } from '../../helpers/mock-factories';

jest.mock('obsidian');
jest.mock('../../../src/modals/TaskSelectorWithCreateModal', () => ({
  openTaskSelector: jest.fn(),
}));

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('Planning trigger — vault-open auto-launch', () => {
  let mockPlugin: any;
  let planningService: PlanningService;

  beforeEach(() => {
    mockPlugin = PluginFactory.createMockPlugin();
    mockPlugin.settings.dailyPlanningOnOpen = true;
    mockPlugin.loadData = jest.fn().mockResolvedValue({});
    mockPlugin.saveData = jest.fn().mockResolvedValue(undefined);
    planningService = new PlanningService(mockPlugin);
  });

  it('setting true + first open of day → shouldTriggerPlanning returns true', async () => {
    mockPlugin.loadData.mockResolvedValue({});

    const result = await planningService.shouldTriggerPlanning();

    expect(result).toBe(true);
  });

  it('already opened today → shouldTriggerPlanning returns false', async () => {
    mockPlugin.loadData.mockResolvedValue({ lastPlanningDate: todayString() });

    const result = await planningService.shouldTriggerPlanning();

    expect(result).toBe(false);
  });

  it('setting false → shouldTriggerPlanning returns false', async () => {
    mockPlugin.settings.dailyPlanningOnOpen = false;
    mockPlugin.loadData.mockResolvedValue({});

    const result = await planningService.shouldTriggerPlanning();

    expect(result).toBe(false);
  });

  it('markPlanningTriggered persists today\'s date', async () => {
    mockPlugin.loadData.mockResolvedValue({});

    await planningService.markPlanningTriggered();

    expect(mockPlugin.saveData).toHaveBeenCalledWith(
      expect.objectContaining({ lastPlanningDate: todayString() })
    );
  });

  it('superflow:open-planning always opens regardless of setting (tested via startPlanning)', () => {
    // The command always calls startPlanning() directly — no daily check.
    // Verify startPlanning works even when setting is off.
    mockPlugin.settings.dailyPlanningOnOpen = false;

    planningService.startPlanning();

    expect(planningService.getState().isActive).toBe(true);
    expect(planningService.getState().currentStep).toBe('review-yesterday');
  });
});
