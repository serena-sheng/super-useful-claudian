import { setIcon } from 'obsidian';
import {
  ClaudeModel,
  ThinkingBudget,
  PermissionMode,
  CLAUDE_MODELS,
  THINKING_BUDGETS,
  DEFAULT_THINKING_BUDGET,
} from '../types';

/**
 * Interface for settings access needed by toolbar components
 */
export interface ToolbarSettings {
  model: ClaudeModel;
  thinkingBudget: ThinkingBudget;
  permissionMode: PermissionMode;
}

/**
 * Callback interface for toolbar changes
 */
export interface ToolbarCallbacks {
  onModelChange: (model: ClaudeModel) => Promise<void>;
  onThinkingBudgetChange: (budget: ThinkingBudget) => Promise<void>;
  onPermissionModeChange: (mode: PermissionMode) => Promise<void>;
  getSettings: () => ToolbarSettings;
}

/**
 * Model selector component
 */
export class ModelSelector {
  private container: HTMLElement;
  private buttonEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private callbacks: ToolbarCallbacks;

  constructor(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'claudian-model-selector' });
    this.render();
  }

  private render() {
    this.container.empty();

    // Current model button (dropdown shows on hover via CSS)
    this.buttonEl = this.container.createDiv({ cls: 'claudian-model-btn' });
    this.updateDisplay();

    // Dropdown menu (shown on hover via CSS)
    this.dropdownEl = this.container.createDiv({ cls: 'claudian-model-dropdown' });
    this.renderOptions();
  }

  updateDisplay() {
    if (!this.buttonEl) return;
    const currentModel = this.callbacks.getSettings().model;
    const modelInfo = CLAUDE_MODELS.find(m => m.value === currentModel);
    this.buttonEl.empty();

    const labelEl = this.buttonEl.createSpan({ cls: 'claudian-model-label' });
    labelEl.setText(modelInfo?.label || 'Haiku');

    const chevronEl = this.buttonEl.createSpan({ cls: 'claudian-model-chevron' });
    setIcon(chevronEl, 'chevron-up');
  }

  private renderOptions() {
    if (!this.dropdownEl) return;
    this.dropdownEl.empty();

    const currentModel = this.callbacks.getSettings().model;

    for (const model of CLAUDE_MODELS) {
      const option = this.dropdownEl.createDiv({ cls: 'claudian-model-option' });
      if (model.value === currentModel) {
        option.addClass('selected');
      }

      option.createSpan({ text: model.label });

      option.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.callbacks.onModelChange(model.value);
        this.updateDisplay();
        this.renderOptions();
      });
    }
  }
}

/**
 * Thinking budget selector component
 */
export class ThinkingBudgetSelector {
  private container: HTMLElement;
  private gearsEl: HTMLElement | null = null;
  private callbacks: ToolbarCallbacks;

  constructor(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'claudian-thinking-selector' });
    this.render();
  }

  private render() {
    this.container.empty();

    // Label
    const labelEl = this.container.createSpan({ cls: 'claudian-thinking-label-text' });
    labelEl.setText('Thinking:');

    // Gear buttons container (expandable on hover)
    this.gearsEl = this.container.createDiv({ cls: 'claudian-thinking-gears' });
    this.renderGears();
  }

  private renderGears() {
    if (!this.gearsEl) return;
    this.gearsEl.empty();

    const currentBudget = this.callbacks.getSettings().thinkingBudget;
    const currentBudgetInfo = THINKING_BUDGETS.find(b => b.value === currentBudget);

    // Current selection (visible when collapsed)
    const currentEl = this.gearsEl.createDiv({ cls: 'claudian-thinking-current' });
    currentEl.setText(currentBudgetInfo?.label || 'Off');

    // All options (visible when expanded)
    const optionsEl = this.gearsEl.createDiv({ cls: 'claudian-thinking-options' });

    for (const budget of THINKING_BUDGETS) {
      const gearEl = optionsEl.createDiv({ cls: 'claudian-thinking-gear' });
      gearEl.setText(budget.label);
      gearEl.setAttribute('title', budget.tokens > 0 ? `${budget.tokens.toLocaleString()} tokens` : 'Disabled');

      if (budget.value === currentBudget) {
        gearEl.addClass('selected');
      }

      gearEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.callbacks.onThinkingBudgetChange(budget.value);
        this.updateDisplay();
      });
    }
  }

  updateDisplay() {
    this.renderGears();
  }
}

/**
 * Permission mode toggle component
 */
export class PermissionToggle {
  private container: HTMLElement;
  private toggleEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private callbacks: ToolbarCallbacks;

  constructor(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'claudian-permission-toggle' });
    this.render();
  }

  private render() {
    this.container.empty();

    // Label
    this.labelEl = this.container.createSpan({ cls: 'claudian-permission-label' });

    // Toggle switch
    this.toggleEl = this.container.createDiv({ cls: 'claudian-toggle-switch' });

    // Update display
    this.updateDisplay();

    // Toggle on click
    this.toggleEl.addEventListener('click', () => this.toggle());
  }

  updateDisplay() {
    if (!this.toggleEl || !this.labelEl) return;

    const isYolo = this.callbacks.getSettings().permissionMode === 'yolo';

    // Update toggle state
    if (isYolo) {
      this.toggleEl.addClass('active');
    } else {
      this.toggleEl.removeClass('active');
    }

    // Update label
    this.labelEl.setText(isYolo ? 'Yolo' : 'Safe');
  }

  private async toggle() {
    const current = this.callbacks.getSettings().permissionMode;
    const newMode: PermissionMode = current === 'yolo' ? 'normal' : 'yolo';
    await this.callbacks.onPermissionModeChange(newMode);
    this.updateDisplay();
  }
}

/**
 * Factory function to create all toolbar components
 */
export function createInputToolbar(
  parentEl: HTMLElement,
  callbacks: ToolbarCallbacks
): {
  modelSelector: ModelSelector;
  thinkingBudgetSelector: ThinkingBudgetSelector;
  permissionToggle: PermissionToggle;
} {
  const modelSelector = new ModelSelector(parentEl, callbacks);
  const thinkingBudgetSelector = new ThinkingBudgetSelector(parentEl, callbacks);
  const permissionToggle = new PermissionToggle(parentEl, callbacks);

  return { modelSelector, thinkingBudgetSelector, permissionToggle };
}
