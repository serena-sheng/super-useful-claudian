import '@/providers';

import { getEnabledProviderForModel, getProviderForModel } from '@/core/providers/modelRouting';

describe('getProviderForModel', () => {
  it('routes provider-qualified model selection ids to their registered provider', () => {
    expect(getProviderForModel('omp/omp:anthropic/sonnet')).toBe('omp');
    expect(getProviderForModel('omp:anthropic/sonnet')).toBe('omp');
    expect(getProviderForModel('deepseek:native/model')).toBe('deepseek');
  });

  it('leaves unknown models unresolved', () => {
    expect(getProviderForModel('some-unknown-model')).toBeNull();
  });

  it('does not resolve selections owned by a removed provider', () => {
    expect(getProviderForModel('claude-code/sonnet')).toBeNull();
    expect(getProviderForModel('openai-codex/gpt-5.5')).toBeNull();
  });

  it('rejects ambiguous ownership and resolves within enabled providers only', () => {
    const settings = {
      settingsProvider: 'omp',
      providerConfigs: {
        omp: { enabled: true },
        deepseek: { enabled: false },
      },
    };

    expect(getProviderForModel('deepseek:native/model', settings)).toBe('deepseek');
    expect(getEnabledProviderForModel('deepseek:native/model', settings)).toBeNull();
    expect(getEnabledProviderForModel('omp:anthropic/sonnet', settings)).toBe('omp');
  });
});

it('leaves an unclaimed model unresolved instead of selecting the default provider', () => {
  expect(getProviderForModel('retired-endpoint-model', {
    providerConfigs: { omp: { enabled: true }, deepseek: { enabled: true } },
  })).toBeNull();
});
