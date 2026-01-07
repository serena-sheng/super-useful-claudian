import * as fs from 'fs';

import { getDefaultCliPaths } from '@/core/types';
import { ClaudeCliResolver } from '@/utils/claudeCli';
import { findClaudeCLIPath } from '@/utils/path';

jest.mock('fs');
jest.mock('@/utils/path', () => {
  const actual = jest.requireActual('@/utils/path');
  return {
    ...actual,
    findClaudeCLIPath: jest.fn(),
  };
});

const mockedExists = fs.existsSync as jest.Mock;
const mockedStat = fs.statSync as jest.Mock;
const mockedFind = findClaudeCLIPath as jest.Mock;

describe('ClaudeCliResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore legacy path when platform paths are provided', () => {
    mockedExists.mockImplementation((p: string) => p === '/legacy/claude');
    mockedStat.mockReturnValue({ isFile: () => true });
    mockedFind.mockReturnValue('/auto/claude');

    const resolver = new ClaudeCliResolver();
    const resolved = resolver.resolve(getDefaultCliPaths(), '/legacy/claude', '');

    expect(resolved).toBe('/auto/claude');
    expect(mockedFind).toHaveBeenCalled();
  });

  it('should use legacy path when platform paths are not provided', () => {
    mockedExists.mockImplementation((p: string) => p === '/legacy/claude');
    mockedStat.mockReturnValue({ isFile: () => true });
    mockedFind.mockReturnValue('/auto/claude');

    const resolver = new ClaudeCliResolver();
    const resolved = resolver.resolve(undefined, '/legacy/claude', '');

    expect(resolved).toBe('/legacy/claude');
    expect(mockedFind).not.toHaveBeenCalled();
  });
});
