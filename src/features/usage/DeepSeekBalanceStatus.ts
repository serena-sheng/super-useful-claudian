export interface BalanceStatusSnapshot {
  /** Formatted primary reading, or null while nothing is readable yet. */
  value: string | null;
  tooltip: string;
  loading: boolean;
}

export interface BalanceStatusBarOptions {
  /** The user's "show in the status bar" preference. */
  isEnabled: () => boolean;
  read: () => BalanceStatusSnapshot;
  subscribe: (listener: () => void) => () => void;
  refresh: () => Promise<void>;
  labels: { loading: string; unknown: string; hint: string };
}

export interface BalanceStatusHost {
  /** Absent in headless hosts and some test harnesses. */
  addStatusBarItem?(): HTMLElement;
}

export interface BalanceStatusHandle {
  /** Re-reads the preference and repaints; safe to call on every settings save. */
  refresh(): void;
  dispose(): void;
}

let handle: BalanceStatusHandle | null = null;

/** Repaints the mounted status item after a settings change; a no-op when it is not mounted. */
export function refreshDeepSeekBalanceStatus(): void {
  handle?.refresh();
}

/**
 * Status-bar reading of a provider balance. It paints the last snapshot only: a status item must
 * never start network work on its own, so reads stay user-initiated (a click, or the settings card).
 *
 * Provider-agnostic on purpose: the composition root supplies the reading, so this feature never
 * imports a concrete provider.
 */
export function mountDeepSeekBalanceStatus(
  host: BalanceStatusHost,
  options: BalanceStatusBarOptions,
): BalanceStatusHandle {
  const el = host.addStatusBarItem?.();
  if (!el) return { refresh: () => undefined, dispose: () => undefined };
  el.addClass('claudian-deepseek-balance-status');

  const paint = (): void => {
    const enabled = options.isEnabled();
    el.toggleClass('claudian-hidden', !enabled);
    if (!enabled) return;
    const snapshot = options.read();
    if (snapshot.value !== null) {
      el.setText(snapshot.value);
      el.setAttribute('aria-label', snapshot.tooltip);
      el.setAttribute('title', snapshot.tooltip);
      return;
    }
    el.setText(snapshot.loading ? options.labels.loading : options.labels.unknown);
    el.setAttribute('aria-label', options.labels.hint);
    el.setAttribute('title', options.labels.hint);
  };

  const onClick = (event: MouseEvent): void => {
    event.preventDefault();
    void options.refresh().finally(paint);
  };
  el.addEventListener('click', onClick);
  const unsubscribe = options.subscribe(paint);

  const instance: BalanceStatusHandle = {
    refresh: paint,
    dispose: () => {
      unsubscribe();
      el.removeEventListener('click', onClick);
      el.remove();
      if (handle === instance) handle = null;
    },
  };
  handle = instance;
  paint();
  return instance;
}
