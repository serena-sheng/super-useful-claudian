import { requestUrl, type RequestUrlResponse } from 'obsidian';

/** Public balance endpoint; the CLI's own host never exposes balance, so this is a direct read. */
export const DEEPSEEK_BALANCE_ENDPOINT = 'https://api.deepseek.com/user/balance';
/** Provider environment variable that carries the DeepSeek API key. */
export const DEEPSEEK_API_KEY_VARIABLE = 'DEEPSEEK_API_KEY';
/** Automatic reads stay at least this far apart; a click always refreshes. */
export const MIN_BALANCE_REFRESH_INTERVAL_MS = 30_000;

export interface DeepSeekBalanceInfo {
  currency: string;
  total: number;
  granted: number;
  toppedUp: number;
}

export interface DeepSeekBalanceReading {
  isAvailable: boolean;
  infos: DeepSeekBalanceInfo[];
}

export type DeepSeekBalanceStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DeepSeekBalanceSnapshot {
  status: DeepSeekBalanceStatus;
  reading: DeepSeekBalanceReading | null;
  /** Unix ms of the last successful read. */
  fetchedAt: number | null;
  /** Translation key plus parameters for the last failure, or null. */
  error: { key: 'noKey' | 'unavailable' | 'requestFailed'; message?: string } | null;
}

export interface DeepSeekBalanceDeps {
  /** Resolves the API key from the provider's configured environment. */
  getApiKey: () => string | null;
  /** Injectable for tests; defaults to Obsidian's requestUrl so no CORS proxy is needed. */
  request?: (options: { url: string; method: 'GET'; headers: Record<string, string>; throw: false }) => Promise<Pick<RequestUrlResponse, 'status' | 'json' | 'text'>>;
  now?: () => number;
}

function readFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/** Accepts the documented `{ is_available, balance_infos: [...] }` shape and ignores anything else. */
export function parseDeepSeekBalancePayload(payload: unknown): DeepSeekBalanceReading {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { isAvailable: false, infos: [] };
  const record = payload as Record<string, unknown>;
  const rawInfos = Array.isArray(record.balance_infos) ? record.balance_infos : [];
  const infos = rawInfos.flatMap((raw): DeepSeekBalanceInfo[] => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const info = raw as Record<string, unknown>;
    return [{
      currency: readString(info.currency, 'CNY'),
      total: readFiniteNumber(info.total_balance),
      granted: readFiniteNumber(info.granted_balance),
      toppedUp: readFiniteNumber(info.topped_up_balance),
    }];
  });
  return { isAvailable: record.is_available === true, infos };
}

/**
 * Reads the DeepSeek account balance and keeps the last reading for the settings card and the
 * status bar. Reads happen only on demand: opening the card, clicking the status item, or a
 * refresh that respects the minimum interval.
 */
export class DeepSeekBalanceService {
  private current: DeepSeekBalanceSnapshot = { status: 'idle', reading: null, fetchedAt: null, error: null };
  private readonly listeners = new Set<() => void>();
  private inFlight: Promise<DeepSeekBalanceSnapshot> | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: DeepSeekBalanceDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  get snapshot(): DeepSeekBalanceSnapshot {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reads the balance; a second call while one is running joins it. */
  async refresh(force = false): Promise<DeepSeekBalanceSnapshot> {
    if (this.inFlight) return this.inFlight;
    const fresh = this.current.status === 'ready' && this.current.fetchedAt !== null
      && this.now() - this.current.fetchedAt < MIN_BALANCE_REFRESH_INTERVAL_MS;
    if (!force && fresh) return this.current;
    this.inFlight = this.#read();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  async #read(): Promise<DeepSeekBalanceSnapshot> {
    const apiKey = this.deps.getApiKey();
    if (!apiKey) {
      this.#publish({ status: 'error', reading: null, fetchedAt: this.current.fetchedAt, error: { key: 'noKey' } });
      return this.current;
    }
    this.#publish({ ...this.current, status: 'loading', error: null });
    try {
      const request = this.deps.request ?? requestUrl;
      const response = await request({
        url: DEEPSEEK_BALANCE_ENDPOINT,
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        throw: false,
      });
      if (response.status < 200 || response.status >= 300) {
        this.#publish({ status: 'error', reading: null, fetchedAt: this.current.fetchedAt,
          error: { key: 'requestFailed', message: `HTTP ${response.status}` } });
        return this.current;
      }
      const reading = parseDeepSeekBalancePayload(response.json ?? safeJson(response.text));
      this.#publish({ status: 'ready', reading, fetchedAt: this.now(), error: reading.isAvailable ? null : { key: 'unavailable' } });
      return this.current;
    } catch (error) {
      this.#publish({ status: 'error', reading: null, fetchedAt: this.current.fetchedAt,
        error: { key: 'requestFailed', message: error instanceof Error ? error.message : String(error) } });
      return this.current;
    }
  }

  #publish(next: DeepSeekBalanceSnapshot): void {
    this.current = next;
    for (const listener of [...this.listeners]) listener();
  }
}

function safeJson(text: string | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

let service: DeepSeekBalanceService | null = null;

/** Creates the process-wide balance reader; called once during plugin load. */
export function initDeepSeekBalance(deps: DeepSeekBalanceDeps): DeepSeekBalanceService {
  service = new DeepSeekBalanceService(deps);
  return service;
}

export function getDeepSeekBalance(): DeepSeekBalanceService | null {
  return service;
}

/** Formatting helper shared by the status bar and the settings card. */
export function formatDeepSeekBalance(info: DeepSeekBalanceInfo): string {
  const symbols: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€' };
  const amount = info.total.toFixed(2);
  return `${symbols[info.currency] ?? `${info.currency} `}${amount}`;
}
