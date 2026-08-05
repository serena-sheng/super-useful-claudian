import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Claudian view container styles', () => {
  it('uses a host-specific selector to override view-content spacing', () => {
    const css = readFileSync(path.resolve('src/style/base/container.css'), 'utf8');

    expect(css).toMatch(
      /\.workspace-leaf-content \.view-content\.claudian-container\s*{[\s\S]*?padding:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
  });
});
