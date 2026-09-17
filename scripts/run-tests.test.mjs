import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Exercise the real runner in an isolated checkout with observable child programs.
test('the runner executes only selected Jest and script suites, and handles empty selections', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'claudian-test-runner-'));
  try {
    mkdirSync(path.join(root, 'scripts'));
    for (const file of ['run-tests.js', 'run-cross-platform-collab-tests.js', 'testSuites.cjs']) copyFileSync(`scripts/${file}`, path.join(root, 'scripts', file));
    writeFileSync(path.join(root, 'scripts/run-jest.js'), `require('node:fs').writeFileSync('jest-args.json', JSON.stringify(process.argv.slice(2)));`);
    writeFileSync(path.join(root, 'scripts/summarize-jest-results.test.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync('script-ran', 'yes');`);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = (...args) => execFileSync(process.execPath, ['scripts/run-tests.js', ...args], { cwd: root, encoding: 'utf8', env });
    run('--selection', '[]', '--script-selection', '[]');
    const selected = ['tests/unit/example.test.ts'];
    run('--selection', JSON.stringify(selected), '--script-selection', '["scripts/summarize-jest-results.test.mjs"]');
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'jest-args.json'))), ['--runTestsByPath', ...selected]);
    assert.equal(readFileSync(path.join(root, 'script-ran'), 'utf8'), 'yes');
    rmSync(path.join(root, 'jest-args.json'));
    rmSync(path.join(root, 'script-ran'));
    run('--selection', '[]', '--script-selection', '[]');
    assert.throws(() => readFileSync(path.join(root, 'jest-args.json')), { code: 'ENOENT' });
    assert.throws(() => readFileSync(path.join(root, 'script-ran')), { code: 'ENOENT' });
    const nativeTest = 'tests/unit/utils/windowsCmdShim.test.ts';
    execFileSync(process.execPath, ['scripts/run-cross-platform-collab-tests.js', '--selection', JSON.stringify([nativeTest])], { cwd: root, env });
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'jest-args.json'))), ['--runInBand', '--runTestsByPath', nativeTest]);
    const invalid = spawnSync(process.execPath, ['scripts/run-tests.js', '--selection', '[]', '--script-selection', '["scripts/unknown.mjs"]'], { cwd: root });
    assert.notEqual(invalid.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
