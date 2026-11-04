/**
 * Fixture for tests whose subject reads a provider's persisted model catalog.
 *
 * Entries use the raw `<provider>/<model>` shape OMP's configuration decoder accepts, so
 * the decoded settings and the provider model policy shape are both exercised.
 */
export function ompCatalogFixture(
  ids: readonly string[] = ['anthropic/claude-sonnet-4-5'],
  thinkingLevels?: readonly string[],
) {
  const discoveredModels = ids.map(encoded => {
    const separator = encoded.indexOf('/');
    const provider = separator > 0 ? encoded.slice(0, separator) : 'anthropic';
    const id = separator > 0 ? encoded.slice(separator + 1) : encoded;
    return {
      id,
      input: ['text', 'image'],
      label: id,
      provider,
      ...(thinkingLevels ? { thinkingLevels: [...thinkingLevels] } : {}),
    };
  });
  return {
    discoveredModels,
    visibleModels: discoveredModels.map(model => `omp:${model.provider}/${model.id}`),
  };
}
