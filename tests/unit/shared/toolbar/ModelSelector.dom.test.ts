/** @jest-environment jsdom */

import '@/providers';

import { fireEvent, waitFor, within } from '@testing-library/dom';
import { axe } from 'jest-axe';

import type { ToolbarCallbacks } from '@/features/chat/composer/toolbar/types';
import { normalizeOmpDiscoveredModels } from '@/providers/omp/models';
import { updateOmpProviderSettings } from '@/providers/omp/settings';
import { ompChatUIConfig } from '@/providers/omp/ui/OmpChatUIConfig';
import { EffortSelector } from '@/shared/toolbar/EffortSelector';
import { ModelSelector } from '@/shared/toolbar/ModelSelector';
import { getProviderPickerModelOptions } from '@/shared/toolbar/providerPickerModelOptions';

HTMLElement.prototype.empty = function () { this.replaceChildren(); };
HTMLElement.prototype.addClass = function (...classes) { this.classList.add(...classes); };
HTMLElement.prototype.removeClass = function (...classes) { this.classList.remove(...classes); };
HTMLElement.prototype.hasClass = function (name) { return this.classList.contains(name); };
HTMLElement.prototype.toggleClass = function (classes, value) {
  for (const name of typeof classes === 'string' ? [classes] : classes) this.classList.toggle(name, value);
};

afterEach(() => {
  document.body.replaceChildren();
});

const persistedModels = [
  ['toString', 'String Model'],
  ['__proto__', 'Proto Model'],
  ['constructor', 'Constructor Model'],
] as const;

function ompSettings(aliases: Record<string, string> | null) {
  const settings: Record<string, unknown> = { model: 'omp:anthropic/__proto__' };
  updateOmpProviderSettings(settings, {
    discoveredModels: normalizeOmpDiscoveredModels(persistedModels.map(([id, label]) => ({
      provider: 'anthropic', id, label, input: ['text'], thinkingLevels: ['off', 'high'],
    }))),
    visibleModels: persistedModels.map(([id]) => `omp:anthropic/${id}`),
    modelAliases: aliases ?? {},
  });
  return JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
}

it.each([
  {
    name: 'discovered labels without own aliases',
    aliases: null,
    labels: ['String Model', 'Proto Model', 'Constructor Model'],
  },
  {
    name: 'imported own aliases',
    aliases: '{"omp:anthropic/toString":"Custom String","omp:anthropic/__proto__":"Custom Proto","omp:anthropic/constructor":"Custom Constructor"}',
    labels: ['Custom String', 'Custom Proto', 'Custom Constructor'],
  },
])('renders persisted OMP $name in the named toolbar and options', async ({ aliases, labels }) => {
  const settings = ompSettings(aliases === null ? {} : JSON.parse(aliases));

  const host = document.body.createDiv();
  new ModelSelector(host, {
    getSettings: () => settings,
    getUIConfig: () => ompChatUIConfig,
    onModelChange: async (model: string) => { settings.model = model; },
  } as unknown as ToolbarCallbacks);

  fireEvent.click(within(host).getByRole('button', { name: `Model: ${labels[1]}` }));
  const optionLabels = () => within(host).getAllByRole('option')
    .map(node => node.querySelector('.claudian-toolbar-popover-option-label')?.textContent);
  expect(optionLabels()).toEqual(labels);
  expect(within(host).getByRole('option', { name: labels[1] }).getAttribute('aria-selected')).toBe('true');
  expect((await axe(host)).violations).toEqual([]);

  const values = persistedModels.map(([id]) => `omp:anthropic/${id}`);
  for (const [index, label] of labels.entries()) {
    fireEvent.click(within(host).getByRole('option', { name: label }));
    await waitFor(() => {
      expect(settings.model).toBe(values[index]);
      expect(within(host).getByRole('button', { name: `Model: ${label}` }).textContent).toBe(label);
    });
  }
});

it('renders saved model order top-to-bottom through the real provider UI config', () => {
  const host = document.body.createDiv();
  const config = {
    discoveredModels: ['opus', 'haiku', 'sonnet'].map(id => ({
      provider: 'anthropic', id, label: id, input: ['text'], thinkingLevels: ['off'],
    })),
    visibleModels: ['omp:anthropic/haiku', 'omp:anthropic/sonnet', 'omp:anthropic/opus'],
  };
  const selector = new ModelSelector(host, {
    getSettings: () => ({ model: 'omp:anthropic/haiku', providerConfigs: { omp: config } }),
    getUIConfig: () => ompChatUIConfig,
  } as unknown as ToolbarCallbacks);
  fireEvent.click(within(host).getByRole('button', { name: /^Model: haiku/ }));
  const labels = () => within(host).getAllByRole('option')
    .map(node => node.querySelector('.claudian-toolbar-popover-option-label')?.textContent);
  expect(labels()).toEqual(['haiku', 'sonnet', 'opus']);
  // A single-provider list takes the view's active-provider brand; rows name no provider.
  expect(within(host).getAllByRole('option').map(node => node.getAttribute('data-provider'))).toEqual([null, null, null]);
  config.visibleModels = ['omp:anthropic/sonnet', 'omp:anthropic/opus', 'omp:anthropic/haiku'];
  selector.renderOptions();
  expect(labels()).toEqual(['sonnet', 'opus', 'haiku']);
});

it('hides the parts column while none of its parts is shown', () => {
  const host = document.body.createDiv();
  let reasoningControl = 'none';
  const callbacks = {
    getSettings: () => ({ model: 'opus', reasoning: 'high' }),
    getUIConfig: () => ({
      getModelOptions: () => [{ value: 'opus', label: 'opus' }],
      getReasoningOptions: () => [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }],
      getDefaultReasoningValue: () => 'low',
    }),
    getCapabilities: () => ({ reasoningControl }),
  } as unknown as ToolbarCallbacks;
  const effort = new EffortSelector(new ModelSelector(host, callbacks), callbacks);
  const parts = host.querySelector('.claudian-model-parts')!;
  expect(parts.classList.contains('claudian-hidden')).toBe(true);
  reasoningControl = 'effort';
  effort.updateDisplay();
  expect(parts.classList.contains('claudian-hidden')).toBe(false);
});

it('lists a new session\'s providers in their own column and shows one provider\'s models at a time', async () => {
  const host = document.body.createDiv();
  const settings = {
    model: 'omp:anthropic/opus',
    reasoning: 'high',
    providerConfigs: {
      omp: {
        enabled: true,
        discoveredModels: [
          { provider: 'anthropic', id: 'opus', label: 'opus', input: ['text'], thinkingLevels: [] },
          { provider: 'anthropic', id: 'haiku', label: 'haiku', input: ['text'], thinkingLevels: [] },
        ],
        visibleModels: ['omp:anthropic/haiku', 'omp:anthropic/opus'],
      },
      deepseek: {
        enabled: true,
        discoveredModels: [
          { provider: 'native', id: 'alpha', label: 'Alpha', reasoning: [] },
          { provider: 'native', id: 'beta', label: 'Beta', reasoning: [] },
        ],
        visibleModels: ['deepseek:native/alpha', 'deepseek:native/beta'],
      },
    },
  };
  const onModelChange = jest.fn(async (model: string) => { settings.model = model; });
  const callbacks = {
    getSettings: () => settings,
    getUIConfig: () => ({
      getModelOptions: (options: Record<string, unknown>) => getProviderPickerModelOptions(() => options),
      getReasoningOptions: () => [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }],
      getDefaultReasoningValue: () => 'low',
    }),
    getCapabilities: () => ({ reasoningControl: 'effort' }),
    onModelChange,
  } as unknown as ToolbarCallbacks;
  new EffortSelector(new ModelSelector(host, callbacks), callbacks);
  const button = within(host).getByRole('button', { name: /^Model: opus/ });
  fireEvent.click(button);

  const providers = within(host).getByRole('tablist', { name: 'Provider' });
  const tab = (name: string) => within(providers).getByRole('tab', { name });
  const modelList = () => within(host).getByRole('listbox', { name: 'Model' });
  const shown = () => within(modelList()).getAllByRole('option')
    .map(item => item.querySelector('.claudian-toolbar-popover-option-label')?.textContent);
  // Providers follow the settings tab order; the current model's provider is shown first, in saved model order.
  expect(within(providers).getAllByRole('tab').map(item => [item.getAttribute('aria-label'), item.getAttribute('aria-selected')]))
    .toEqual([['DeepSeek Harness', 'false'], ['OMP', 'true']]);
  expect(shown()).toEqual(['haiku', 'opus']);
  expect(within(modelList()).getByRole('option', { name: 'opus' }).getAttribute('aria-selected')).toBe('true');
  // The selected model, not the selected provider, takes focus when the popover opens.
  expect(document.activeElement).toBe(within(modelList()).getByRole('option', { name: 'opus' }));
  // Each tab names its provider so its icon carries that provider's brand colour.
  expect(tab('DeepSeek Harness').getAttribute('data-provider')).toBe('deepseek');
  expect(tab('DeepSeek Harness').getAttribute('aria-controls')).toBe(modelList().id);
  expect((await axe(host)).violations).toEqual([]);

  // Choosing a provider only browses its models; the session's model is unchanged until a model is picked.
  tab('DeepSeek Harness').focus();
  fireEvent.click(tab('DeepSeek Harness'));
  expect(tab('DeepSeek Harness').getAttribute('aria-selected')).toBe('true');
  expect([tab('OMP').tabIndex, tab('DeepSeek Harness').tabIndex]).toEqual([-1, 0]);
  expect(document.activeElement).toBe(tab('DeepSeek Harness'));
  expect(shown()).toEqual(['Alpha', 'Beta']);
  expect(onModelChange).not.toHaveBeenCalled();
  expect(within(modelList()).queryAllByRole('option', { selected: true })).toEqual([]);
  // With no model chosen in the browsed provider, no thinking level is chosen either, and the
  // current model's levels cannot be changed from here.
  const levels = () => within(host).getAllByRole('option', { name: /^(Low|High)$/, hidden: true });
  expect(levels().map(level => level.getAttribute('aria-selected'))).toEqual(['false', 'false']);
  expect(host.querySelector('.claudian-model-parts')?.hasAttribute('inert')).toBe(true);
  // Arrow keys skip the faded column: Down from the last model wraps to the first provider.
  fireEvent.keyDown(within(modelList()).getByRole('option', { name: 'Beta' }), { key: 'ArrowDown' });
  expect(document.activeElement).toBe(tab('DeepSeek Harness'));
  // Browsing back to the current model's provider restores its level.
  fireEvent.click(tab('OMP'));
  expect(levels().map(level => level.getAttribute('aria-selected'))).toEqual(['true', 'false']);
  expect(host.querySelector('.claudian-model-parts')?.hasAttribute('inert')).toBe(false);
  fireEvent.click(tab('DeepSeek Harness'));

  fireEvent.click(within(modelList()).getByRole('option', { name: 'Beta' }));
  await waitFor(() => expect(button.getAttribute('aria-label')).toBe('Model: Beta, effort High'));
  expect(onModelChange).toHaveBeenCalledWith(expect.stringContaining('beta'));
  // Once a model of the browsed provider is chosen, its level is shown and editable again.
  expect(levels().map(level => level.getAttribute('aria-selected'))).toEqual(['true', 'false']);
  expect(host.querySelector('.claudian-model-parts')?.hasAttribute('inert')).toBe(false);

  // A provider's upstream groups keep their headings in a new session, as in a started one.
  fireEvent.click(tab('OMP'));
  expect(within(modelList()).getAllByRole('group').map(group => [
    host.querySelector(`#${group.getAttribute('aria-labelledby')}`)?.textContent,
    within(group).getAllByRole('option').map(item => item.querySelector('.claudian-toolbar-popover-option-label')?.textContent),
  ])).toEqual([['anthropic', ['haiku', 'opus']]]);

  // Reopening starts on the provider of the model now in use.
  fireEvent.click(button);
  fireEvent.click(button);
  expect(tab('DeepSeek Harness').getAttribute('aria-selected')).toBe('true');
  expect(within(modelList()).getByRole('option', { name: 'Beta', selected: true })).toBe(document.activeElement);
});
