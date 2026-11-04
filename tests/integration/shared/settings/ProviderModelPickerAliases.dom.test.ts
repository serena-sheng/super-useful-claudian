/** @jest-environment jsdom */

import '@test/helpers/ObsidianSettingsDOM';

import { deserialize, serialize } from 'node:v8';

import { fireEvent, waitFor, within } from '@testing-library/dom';
import { axe } from 'jest-axe';

import { SettingsCoordinator } from '@/app/settings/SettingsCoordinator';
import { createProviderRuntimeHost } from '@/composition/ClaudianProviderHost';
import type { ProviderHost } from '@/core/providers/ProviderHost';
import { createDeepSeekModels } from '@/providers/deepseek/runtime/DeepSeekModels';
import { getDeepSeekProviderSettings } from '@/providers/deepseek/settings';
import { renderProviderModelsSection } from '@/shared/settings/ProviderModelsSection';

jest.mock('obsidian', () => jest.requireActual('../../../helpers/ObsidianSettingsDOM'));

// Obsidian's createEl applies the native type option as well as attr.
const originalCreateEl = HTMLElement.prototype.createEl;
HTMLElement.prototype.createEl = function (tag, info, callback) {
  const element = originalCreateEl.call(this, tag, info) as HTMLElement;
  if (typeof info === 'object' && typeof info.type === 'string') element.setAttribute('type', info.type);
  callback?.(element as never);
  return element as never;
};

afterEach(() => { document.body.replaceChildren(); });
afterAll(() => { HTMLElement.prototype.createEl = originalCreateEl; });

it.each(['Enter', 'Escape'])('leaves composing %s to the provider alias editor', async key => {
  globalThis.structuredClone ??= value => deserialize(serialize(value));
  const settings = { providerConfigs: { deepseek: {
    enabled: true, visibleModels: ['deepseek:native/gateway-model'], modelAliases: {},
    discoveredModels: [{
      provider: 'native', id: 'gateway-model', label: 'Gateway model',
      reasoning: [{ id: 'high', name: 'High' }],
    }],
  } } };
  let saved = '';
  const coordinator = new SettingsCoordinator(settings, async draft => { saved = JSON.stringify(draft); });
  const host = { settings, mutateSettings: coordinator.mutate.bind(coordinator), notifyProviderChatOptionsChanged: jest.fn() } as unknown as ProviderHost;
  const catalog = createDeepSeekModels(createProviderRuntimeHost(host, coordinator, 'deepseek'), async () => ({
    groups: [{ id: 'native', models: [{ id: 'gateway-model', name: 'Gateway model' }] }],
  }));
  await catalog.refresh();
  const container = document.body.createDiv();
  const picker = renderProviderModelsSection(container, 'deepseek', 'DeepSeek Harness', catalog);
  const field = within(container).getByRole('textbox', { name: 'Alias for native/Gateway model' }) as HTMLInputElement;
  try {
    expect((await axe(container)).violations).toEqual([]);
    field.focus();
    fireEvent.compositionStart(field);
    fireEvent.input(field, { target: { value: 'unfinished' }, isComposing: true });
    expect(fireEvent.keyDown(field, { key, isComposing: true })).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('unfinished');
    await coordinator.persistCurrent();
    expect(getDeepSeekProviderSettings(JSON.parse(saved)).modelAliases).toEqual({});
    fireEvent.compositionEnd(field);
    fireEvent.input(field, { target: { value: '完成' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(getDeepSeekProviderSettings(settings).modelAliases['deepseek:native/gateway-model']).toBe('完成'));
    expect(getDeepSeekProviderSettings(JSON.parse(saved)).modelAliases['deepseek:native/gateway-model']).toBe('完成');
  } finally {
    picker.dispose(); await catalog.dispose(); container.remove();
  }
});

it.each(['constructor', 'toString', '__proto__'])('edits and clears an alias for a prototype-named model %s', async modelId => {
  globalThis.structuredClone ??= value => deserialize(serialize(value));
  const encodedId = `deepseek:native/${modelId}`;
  const settings = { providerConfigs: { deepseek: {
    enabled: true, visibleModels: [encodedId], modelAliases: {},
    discoveredModels: [{
      provider: 'native', id: modelId, label: 'Gateway model',
      reasoning: [{ id: 'high', name: 'High' }],
    }],
  } } };
  let saved = '';
  const coordinator = new SettingsCoordinator(settings, async draft => { saved = JSON.stringify(draft); });
  const notify = jest.fn();
  const host = {
    settings, mutateSettings: coordinator.mutate.bind(coordinator), notifyProviderChatOptionsChanged: notify,
  } as unknown as ProviderHost;
  const catalog = createDeepSeekModels(createProviderRuntimeHost(host, coordinator, 'deepseek'), async () => ({
    groups: [{ id: 'native', models: [{ id: modelId, name: 'Gateway model' }] }],
  }));
  await catalog.refresh();
  notify.mockClear();
  const container = document.body.createDiv();
  const picker = renderProviderModelsSection(container, 'deepseek', 'DeepSeek Harness', catalog);
  const aliasField = () => within(container).getByRole('textbox', { name: 'Alias for native/Gateway model' }) as HTMLInputElement;
  try {
    expect(aliasField().value).toBe('');
    expect((await axe(container)).violations).toEqual([]);
    aliasField().focus();
    fireEvent.input(aliasField(), { target: { value: ' Friendly name ' } });
    fireEvent.keyDown(aliasField(), { key: 'Enter' });
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    const committed = getDeepSeekProviderSettings(settings).modelAliases;
    expect(Object.hasOwn(committed, encodedId)).toBe(true);
    expect(committed[encodedId]).toBe('Friendly name');
    expect(getDeepSeekProviderSettings(JSON.parse(saved)).modelAliases[encodedId]).toBe('Friendly name');
    expect(aliasField().value).toBe('Friendly name');
    aliasField().focus();
    fireEvent.input(aliasField(), { target: { value: 'Uncommitted' } });
    fireEvent.keyDown(aliasField(), { key: 'Escape' });
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
    expect(aliasField().value).toBe('Friendly name');
    aliasField().focus();
    fireEvent.input(aliasField(), { target: { value: '' } });
    fireEvent.keyDown(aliasField(), { key: 'Enter' });
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(3));
    expect(Object.hasOwn(getDeepSeekProviderSettings(settings).modelAliases, encodedId)).toBe(false);
    expect(aliasField().value).toBe('');
    aliasField().focus();
    fireEvent.input(aliasField(), { target: { value: 'Discard' } });
    fireEvent.keyDown(aliasField(), { key: 'Escape' });
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(4));
    expect(aliasField().value).toBe('');
  } finally {
    picker.dispose(); await catalog.dispose(); container.remove();
  }
});
