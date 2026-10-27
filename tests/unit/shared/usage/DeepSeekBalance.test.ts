import {
  DeepSeekBalanceService,
  formatDeepSeekBalance,
  MIN_BALANCE_REFRESH_INTERVAL_MS,
  parseDeepSeekBalancePayload,
} from '@/shared/usage/DeepSeekBalance';

const payload = {
  is_available: true,
  balance_infos: [{ currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }],
};

function createService(options: {
  apiKey?: string | null;
  response?: { status: number; json?: unknown; text?: string };
  now?: () => number;
} = {}) {
  const request = jest.fn().mockResolvedValue(options.response ?? { status: 200, json: payload });
  const service = new DeepSeekBalanceService({
    getApiKey: () => (options.apiKey === undefined ? 'sk-test' : options.apiKey),
    request,
    now: options.now,
  });
  return { service, request };
}

describe('parseDeepSeekBalancePayload', () => {
  it('reads the documented balance shape', () => {
    expect(parseDeepSeekBalancePayload(payload)).toEqual({
      isAvailable: true,
      infos: [{ currency: 'CNY', total: 110, granted: 10, toppedUp: 100 }],
    });
  });

  it('accepts numeric amounts and defaults a missing currency', () => {
    expect(parseDeepSeekBalancePayload({ is_available: true, balance_infos: [{ total_balance: 5 }] }))
      .toEqual({ isAvailable: true, infos: [{ currency: 'CNY', total: 5, granted: 0, toppedUp: 0 }] });
  });

  it('returns an unavailable reading for anything else', () => {
    expect(parseDeepSeekBalancePayload(null)).toEqual({ isAvailable: false, infos: [] });
    expect(parseDeepSeekBalancePayload({ is_available: false, balance_infos: [] }))
      .toEqual({ isAvailable: false, infos: [] });
  });
});

describe('formatDeepSeekBalance', () => {
  it('uses a currency symbol where one is known', () => {
    expect(formatDeepSeekBalance({ currency: 'CNY', total: 110, granted: 0, toppedUp: 110 })).toBe('¥110.00');
    expect(formatDeepSeekBalance({ currency: 'USD', total: 7.5, granted: 0, toppedUp: 7.5 })).toBe('$7.50');
    expect(formatDeepSeekBalance({ currency: 'XYZ', total: 1, granted: 0, toppedUp: 1 })).toBe('XYZ 1.00');
  });
});

describe('DeepSeekBalanceService', () => {
  it('reports a missing API key without calling the network', async () => {
    const { service, request } = createService({ apiKey: null });
    await service.refresh();
    expect(request).not.toHaveBeenCalled();
    expect(service.snapshot).toMatchObject({ status: 'error', error: { key: 'noKey' } });
  });

  it('reads the balance with the provider key', async () => {
    const { service, request } = createService();
    const listener = jest.fn();
    service.subscribe(listener);

    await service.refresh(true);

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.deepseek.com/user/balance',
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
    }));
    expect(service.snapshot).toMatchObject({
      status: 'ready',
      reading: { isAvailable: true, infos: [{ total: 110 }] },
      error: null,
    });
    expect(listener).toHaveBeenCalled();
  });

  it('keeps the last reading when the request fails', async () => {
    const { service } = createService({ response: { status: 401, text: 'unauthorized' } });
    await service.refresh(true);
    expect(service.snapshot.status).toBe('error');
    expect(service.snapshot.error).toEqual({ key: 'requestFailed', message: 'HTTP 401' });
  });

  it('reuses a reading inside the refresh interval unless forced', async () => {
    let now = 1_000;
    const { service, request } = createService({ now: () => now });
    await service.refresh(true);
    expect(request).toHaveBeenCalledTimes(1);

    now += MIN_BALANCE_REFRESH_INTERVAL_MS - 1;
    await service.refresh();
    expect(request).toHaveBeenCalledTimes(1);

    now += 1;
    await service.refresh();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('joins a read already in flight', async () => {
    const request = jest.fn().mockResolvedValue({ status: 200, json: payload });
    const service = new DeepSeekBalanceService({ getApiKey: () => 'sk-test', request });
    await Promise.all([service.refresh(true), service.refresh(true), service.refresh(true)]);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
