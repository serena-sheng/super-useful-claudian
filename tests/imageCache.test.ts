import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ensureImageCacheDir, saveImageToCache, readCachedImageBase64, deleteCachedImages } from '../src/imageCache';
import { ImageMediaType } from '../src/types';

function createMockApp(vaultPath: string) {
  return {
    vault: {
      adapter: {
        basePath: vaultPath,
      },
    },
  } as any;
}

function createTempVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudian-vault-'));
  return dir;
}

describe('imageCache', () => {
  let vaultPath: string;
  let app: any;

  beforeEach(() => {
    vaultPath = createTempVault();
    app = createMockApp(vaultPath);
  });

  afterEach(() => {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  });

  it('creates cache directory and saves image with hash-based dedupe', () => {
    const buffer = Buffer.from('test-image');
    const mediaType: ImageMediaType = 'image/png';

    const dir = ensureImageCacheDir(app);
    expect(dir).toBe(path.join(vaultPath, '.claudian-cache', 'images'));

    const first = saveImageToCache(app, buffer, mediaType, 'pic.png');
    const second = saveImageToCache(app, buffer, mediaType, 'other.png');

    expect(first?.relPath).toBeDefined();
    expect(second?.relPath).toBe(first?.relPath);

    const absPath = path.join(vaultPath, first!.relPath);
    expect(fs.existsSync(absPath)).toBe(true);
    expect(fs.readFileSync(absPath).toString()).toBe('test-image');
  });

  it('reads cached image as base64', () => {
    const buffer = Buffer.from('another-image');
    const cache = saveImageToCache(app, buffer, 'image/jpeg', 'photo.jpg');
    expect(cache).not.toBeNull();

    const base64 = readCachedImageBase64(app, cache!.relPath);
    expect(base64).toBe(buffer.toString('base64'));
  });

  it('deletes cached images when requested', () => {
    const buffer = Buffer.from('delete-me');
    const cache = saveImageToCache(app, buffer, 'image/png', 'delete.png');
    const absPath = path.join(vaultPath, cache!.relPath);
    expect(fs.existsSync(absPath)).toBe(true);

    deleteCachedImages(app, [cache!.relPath]);
    expect(fs.existsSync(absPath)).toBe(false);
  });
});
