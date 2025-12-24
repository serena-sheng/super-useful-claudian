/**
 * Claudian - Input toolbar components (model selector, thinking budget, permission toggle).
 */

import { setIcon } from 'obsidian';

import type {
  ClaudeModel,
  PermissionMode,
  ThinkingBudget} from '../types';
import {
  DEFAULT_CLAUDE_MODELS,
  THINKING_BUDGETS
} from '../types';
import { getModelsFromEnvironment,parseEnvironmentVariables } from '../utils';

/** Settings access interface for toolbar components. */
export interface ToolbarSettings {
  model: ClaudeModel;
  thinkingBudget: ThinkingBudget;
  permissionMode: PermissionMode;
  allowedContextPaths: string[];
}

/** Callback interface for toolbar changes. */
export interface ToolbarCallbacks {
  onModelChange: (model: ClaudeModel) => Promise<void>;
  onThinkingBudgetChange: (budget: ThinkingBudget) => Promise<void>;
  onPermissionModeChange: (mode: PermissionMode) => Promise<void>;
  onContextPathsChange: (paths: string[]) => Promise<void>;
  getSettings: () => ToolbarSettings;
  getEnvironmentVariables?: () => string;
}

/** Model selector dropdown component. */
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

  /** Returns available models (custom from env vars, or defaults). */
  private getAvailableModels() {
    let models: { value: string; label: string; description: string }[] = [];

    if (this.callbacks.getEnvironmentVariables) {
      const envVarsStr = this.callbacks.getEnvironmentVariables();
      const envVars = parseEnvironmentVariables(envVarsStr);
      const customModels = getModelsFromEnvironment(envVars);

      if (customModels.length > 0) {
        models = customModels;
      } else {
        models = [...DEFAULT_CLAUDE_MODELS];
      }
    } else {
      models = [...DEFAULT_CLAUDE_MODELS];
    }

    return models;
  }

  private render() {
    this.container.empty();

    this.buttonEl = this.container.createDiv({ cls: 'claudian-model-btn' });
    this.updateDisplay();

    this.dropdownEl = this.container.createDiv({ cls: 'claudian-model-dropdown' });
    this.renderOptions();
  }

  updateDisplay() {
    if (!this.buttonEl) return;
    const currentModel = this.callbacks.getSettings().model;
    const models = this.getAvailableModels();
    const modelInfo = models.find(m => m.value === currentModel);

    const displayModel = modelInfo || models[0];

    this.buttonEl.empty();

    const labelEl = this.buttonEl.createSpan({ cls: 'claudian-model-label' });
    labelEl.setText(displayModel?.label || 'Unknown');
  }

  renderOptions() {
    if (!this.dropdownEl) return;
    this.dropdownEl.empty();

    const currentModel = this.callbacks.getSettings().model;
    const models = this.getAvailableModels();

    for (const model of [...models].reverse()) {
      const option = this.dropdownEl.createDiv({ cls: 'claudian-model-option' });
      if (model.value === currentModel) {
        option.addClass('selected');
      }

      option.createSpan({ text: model.label });
      if (model.description) {
        option.setAttribute('title', model.description);
      }

      option.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.callbacks.onModelChange(model.value);
        this.updateDisplay();
        this.renderOptions();
      });
    }
  }
}

/** Thinking budget selector component. */
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

    const labelEl = this.container.createSpan({ cls: 'claudian-thinking-label-text' });
    labelEl.setText('Thinking:');

    this.gearsEl = this.container.createDiv({ cls: 'claudian-thinking-gears' });
    this.renderGears();
  }

  private renderGears() {
    if (!this.gearsEl) return;
    this.gearsEl.empty();

    const currentBudget = this.callbacks.getSettings().thinkingBudget;
    const currentBudgetInfo = THINKING_BUDGETS.find(b => b.value === currentBudget);

    const currentEl = this.gearsEl.createDiv({ cls: 'claudian-thinking-current' });
    currentEl.setText(currentBudgetInfo?.label || 'Off');

    const optionsEl = this.gearsEl.createDiv({ cls: 'claudian-thinking-options' });

    for (const budget of [...THINKING_BUDGETS].reverse()) {
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

/** Permission mode toggle (YOLO/Safe). */
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

    this.labelEl = this.container.createSpan({ cls: 'claudian-permission-label' });
    this.toggleEl = this.container.createDiv({ cls: 'claudian-toggle-switch' });

    this.updateDisplay();

    this.toggleEl.addEventListener('click', () => this.toggle());
  }

  updateDisplay() {
    if (!this.toggleEl || !this.labelEl) return;

    const isYolo = this.callbacks.getSettings().permissionMode === 'yolo';

    if (isYolo) {
      this.toggleEl.addClass('active');
    } else {
      this.toggleEl.removeClass('active');
    }

    this.labelEl.setText(isYolo ? 'YOLO' : 'Safe');
  }

  private async toggle() {
    const current = this.callbacks.getSettings().permissionMode;
    const newMode: PermissionMode = current === 'yolo' ? 'normal' : 'yolo';
    await this.callbacks.onPermissionModeChange(newMode);
    this.updateDisplay();
  }
}

/** Context path selector component (folder icon). */
export class ContextPathSelector {
  private container: HTMLElement;
  private iconEl: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private callbacks: ToolbarCallbacks;

  constructor(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'claudian-context-path-selector' });
    this.render();
  }

  private render() {
    this.container.empty();

    const iconWrapper = this.container.createDiv({ cls: 'claudian-context-path-icon-wrapper' });

    this.iconEl = iconWrapper.createDiv({ cls: 'claudian-context-path-icon' });
    setIcon(this.iconEl, 'folder');

    this.badgeEl = iconWrapper.createDiv({ cls: 'claudian-context-path-badge' });

    this.updateDisplay();

    // Click to open native folder picker
    iconWrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openFolderPicker();
    });

    this.dropdownEl = this.container.createDiv({ cls: 'claudian-context-path-dropdown' });
    this.renderDropdown();
  }

  private async openFolderPicker() {
    try {
      // Access Electron's dialog through remote
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { remote } = require('electron');
      const result = await remote.dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Context Path (Read-Only)',
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        const paths = this.callbacks.getSettings().allowedContextPaths;

        if (!paths.includes(selectedPath)) {
          const newPaths = [...paths, selectedPath];
          await this.callbacks.onContextPathsChange(newPaths);
          this.updateDisplay();
          this.renderDropdown();
        }
      }
    } catch (err) {
      console.error('Failed to open folder picker:', err);
    }
  }

  private renderDropdown() {
    if (!this.dropdownEl) return;
    this.dropdownEl.empty();

    const paths = this.callbacks.getSettings().allowedContextPaths;

    // Header
    const headerEl = this.dropdownEl.createDiv({ cls: 'claudian-context-path-header' });
    headerEl.setText('Context Paths (Read-Only)');

    // Path list
    const listEl = this.dropdownEl.createDiv({ cls: 'claudian-context-path-list' });

    if (paths.length === 0) {
      const emptyEl = listEl.createDiv({ cls: 'claudian-context-path-empty' });
      emptyEl.setText('Click folder icon to add');
    } else {
      for (const pathStr of paths) {
        const itemEl = listEl.createDiv({ cls: 'claudian-context-path-item' });

        const pathTextEl = itemEl.createSpan({ cls: 'claudian-context-path-text' });
        // Show shortened path for display
        const displayPath = this.shortenPath(pathStr);
        pathTextEl.setText(displayPath);
        pathTextEl.setAttribute('title', pathStr);

        const removeBtn = itemEl.createSpan({ cls: 'claudian-context-path-remove' });
        setIcon(removeBtn, 'x');
        removeBtn.setAttribute('title', 'Remove path');
        removeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const newPaths = paths.filter(p => p !== pathStr);
          await this.callbacks.onContextPathsChange(newPaths);
          this.updateDisplay();
          this.renderDropdown();
        });
      }
    }
  }

  /** Shorten path for display (replace home dir with ~) */
  private shortenPath(fullPath: string): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const os = require('os');
      const homeDir = os.homedir();
      if (fullPath.startsWith(homeDir)) {
        return '~' + fullPath.slice(homeDir.length);
      }
    } catch {
      // Ignore errors
    }
    return fullPath;
  }

  updateDisplay() {
    if (!this.iconEl || !this.badgeEl) return;

    const paths = this.callbacks.getSettings().allowedContextPaths;
    const count = paths.length;

    if (count > 0) {
      this.iconEl.addClass('active');
      this.iconEl.setAttribute('title', `${count} context path${count > 1 ? 's' : ''} (click to add more)`);

      // Show badge only when more than 1 path
      if (count > 1) {
        this.badgeEl.setText(String(count));
        this.badgeEl.addClass('visible');
      } else {
        this.badgeEl.removeClass('visible');
      }
    } else {
      this.iconEl.removeClass('active');
      this.iconEl.setAttribute('title', 'Add context paths (click)');
      this.badgeEl.removeClass('visible');
    }
  }
}

/** Factory function to create all toolbar components. */
export function createInputToolbar(
  parentEl: HTMLElement,
  callbacks: ToolbarCallbacks
): {
  modelSelector: ModelSelector;
  thinkingBudgetSelector: ThinkingBudgetSelector;
  contextPathSelector: ContextPathSelector;
  permissionToggle: PermissionToggle;
} {
  const modelSelector = new ModelSelector(parentEl, callbacks);
  const thinkingBudgetSelector = new ThinkingBudgetSelector(parentEl, callbacks);
  const contextPathSelector = new ContextPathSelector(parentEl, callbacks);
  const permissionToggle = new PermissionToggle(parentEl, callbacks);

  return { modelSelector, thinkingBudgetSelector, contextPathSelector, permissionToggle };
}
