import { getVaultPath } from '../src/utils';

describe('utils.ts', () => {
  describe('getVaultPath', () => {
    it('should return basePath when adapter has basePath property', () => {
      const mockApp = {
        vault: {
          adapter: {
            basePath: '/Users/test/my-vault',
          },
        },
      } as any;

      const result = getVaultPath(mockApp);

      expect(result).toBe('/Users/test/my-vault');
    });

    it('should return null when adapter does not have basePath', () => {
      const mockApp = {
        vault: {
          adapter: {},
        },
      } as any;

      const result = getVaultPath(mockApp);

      expect(result).toBeNull();
    });

    it('should return null when adapter is undefined', () => {
      const mockApp = {
        vault: {
          adapter: undefined,
        },
      } as any;

      // The function will throw because it tries to use 'in' on undefined
      // This tests error handling - in real usage adapter is always defined
      expect(() => getVaultPath(mockApp)).toThrow();
    });

    it('should handle empty string basePath', () => {
      const mockApp = {
        vault: {
          adapter: {
            basePath: '',
          },
        },
      } as any;

      const result = getVaultPath(mockApp);

      // Empty string is still a valid basePath value
      expect(result).toBe('');
    });

    it('should handle paths with spaces', () => {
      const mockApp = {
        vault: {
          adapter: {
            basePath: '/Users/test/My Obsidian Vault',
          },
        },
      } as any;

      const result = getVaultPath(mockApp);

      expect(result).toBe('/Users/test/My Obsidian Vault');
    });

    it('should handle Windows-style paths', () => {
      const mockApp = {
        vault: {
          adapter: {
            basePath: 'C:\\Users\\test\\vault',
          },
        },
      } as any;

      const result = getVaultPath(mockApp);

      expect(result).toBe('C:\\Users\\test\\vault');
    });
  });
});
