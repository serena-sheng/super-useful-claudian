/** @jest-environment jsdom */

import { steerTabInputMessageFromModifier } from '@/features/chat/tabs/TabInputEvents';
import type { AssembledTabRuntime } from '@/features/chat/tabs/types';

function createTab(options: { canSteer: boolean; hasContent: boolean }) {
  const steerComposer = jest.fn().mockResolvedValue(true);
  const update = jest.fn();
  const tab = {
    controllers: { inputController: {
      canSteerComposer: options.canSteer,
      hasComposerContentForSteer: options.hasContent,
      steerComposer,
    } },
    ui: { steerButton: { update } },
  } as unknown as AssembledTabRuntime;
  return { tab, steerComposer, update };
}

function enterEvent(init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, ...init });
}

describe('steerTabInputMessageFromModifier', () => {
  it('steers the composer into the running turn on Alt+Enter', () => {
    const { tab, steerComposer, update } = createTab({ canSteer: true, hasContent: true });
    const event = enterEvent({ altKey: true });

    expect(steerTabInputMessageFromModifier(tab, event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(steerComposer).toHaveBeenCalledTimes(1);
    return Promise.resolve().then(() => expect(update).toHaveBeenCalled());
  });

  it.each([
    ['plain Enter', {}],
    ['Shift+Alt+Enter', { altKey: true, shiftKey: true }],
    ['Ctrl+Alt+Enter', { altKey: true, ctrlKey: true }],
    ['Meta+Alt+Enter', { altKey: true, metaKey: true }],
    ['Alt+Enter while composing', { altKey: true, isComposing: true }],
  ])('ignores %s', (_label, init) => {
    const { tab, steerComposer } = createTab({ canSteer: true, hasContent: true });
    expect(steerTabInputMessageFromModifier(tab, enterEvent(init))).toBe(false);
    expect(steerComposer).not.toHaveBeenCalled();
  });

  it('leaves the shortcut to the ordinary send path when steering is unavailable', () => {
    const notSteerable = createTab({ canSteer: false, hasContent: true });
    expect(steerTabInputMessageFromModifier(notSteerable.tab, enterEvent({ altKey: true }))).toBe(false);
    expect(notSteerable.steerComposer).not.toHaveBeenCalled();

    const empty = createTab({ canSteer: true, hasContent: false });
    expect(steerTabInputMessageFromModifier(empty.tab, enterEvent({ altKey: true }))).toBe(false);
    expect(empty.steerComposer).not.toHaveBeenCalled();
  });
});
