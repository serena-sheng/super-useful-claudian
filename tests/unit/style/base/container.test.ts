import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Claudian view container styles', () => {
  it('preserves Obsidian host spacing outside the left sidebar', () => {
    const css = readFileSync(path.resolve('src/style/base/container.css'), 'utf8');

    expect(css).not.toMatch(
      /\.workspace-leaf-content \.view-content\.claudian-container\s*{[^}]*padding:/,
    );
  });

  it('releases the left-only vault profile space for the active Claudian view', () => {
    const css = readFileSync(path.resolve('src/style/base/container.css'), 'utf8');

    expect(css).toMatch(
      /\.workspace-split\.mod-left-split:has\(\.workspace-leaf\.mod-active \.view-content\.claudian-container\)\s*{[^}]*--vault-profile-display:\s*none;/,
    );
  });
});
