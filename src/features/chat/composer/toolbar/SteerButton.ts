import { setIcon } from 'obsidian';

import { t } from '@/i18n/i18n';

export interface SteerButtonDeps {
  /** The running turn can take the composer's follow-up right now. */
  canSteer(): boolean;
  /** Clicking sends the composer's text into the running turn. */
  onSteer(): void;
}

/**
 * Composer button that joins the current text to the running turn.
 *
 * It exists only where steering is available: a queued follow-up costs an extra round trip
 * (send, then steer it from the queue strip), and that is exactly what this removes.
 */
export class SteerButton {
  private readonly buttonEl: HTMLButtonElement;

  constructor(parentEl: HTMLElement, private readonly deps: SteerButtonDeps) {
    this.buttonEl = parentEl.createEl('button', {
      cls: 'claudian-steer-button claudian-hidden',
      attr: { type: 'button' },
    });
    const iconEl = this.buttonEl.createSpan({ cls: 'claudian-steer-button-icon' });
    iconEl.setAttribute('aria-hidden', 'true');
    setIcon(iconEl, 'corner-down-right');
    this.buttonEl.createSpan({ cls: 'claudian-steer-button-label', text: t('chat.steer.button') });
    this.buttonEl.addEventListener('click', (event) => {
      event.stopPropagation();
      this.deps.onSteer();
    });
    this.update();
  }

  /** Shows the button only while steering the composer is actually possible. */
  update(): void {
    const available = this.deps.canSteer();
    this.buttonEl.toggleClass('claudian-hidden', !available);
    this.buttonEl.disabled = !available;
    if (!available) return;
    this.buttonEl.setAttribute('aria-label', t('chat.steer.actionLabel'));
    this.buttonEl.setAttribute('title', t('chat.steer.actionLabel'));
  }

  destroy(): void {
    this.buttonEl.remove();
  }
}
