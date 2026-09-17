import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { selectCiTests } from './ciTestSelection.mjs';

const prompt = 'tests/unit/core/prompt/mainAgent.test.ts';
const collab = 'tests/integration/app/collab/gates/ProjectUpdateMilestoneGate.test.ts';
const select = (changes, relatedTests = [prompt], eventName = 'pull_request') =>
  selectCiTests({ changes, relatedTests, eventName });

test('prompt changes select consumers without unrelated Collab jobs', () => {
  assert.deepEqual(select([{ status: 'M', path: 'src/core/prompt/mainAgent.ts' }]), {
    testFiles: [prompt], lanCompatibility: false, crossPlatform: false,
  });
});

test('shared dependencies retain Collab consumers and platform checks', () => {
  assert.deepEqual(select([{ status: 'M', path: 'src/utils/env.ts' }], [prompt, collab]), {
    testFiles: [prompt, collab], lanCompatibility: true, crossPlatform: true,
  });
});

test('direct Collab and native process changes retain their extra checks', () => {
  assert.equal(select([{ status: 'M', path: 'src/app/collab/lan/LanHostCoordinator.ts' }], []).lanCompatibility, true);
  const pi = select([{ status: 'M', path: 'src/providers/pi/runtime/PiSubprocess.ts' }], []);
  assert.equal(pi.crossPlatform, true);
  assert.equal(pi.lanCompatibility, false);
});

test('deletions, unrecognized changes, and global configuration run full verification', () => {
  for (const change of [
    { status: 'D', path: 'src/core/prompt/mainAgent.ts' },
    { status: 'M', path: 'package-lock.json' },
    { status: 'M', path: 'jest.config.js' },
    { status: 'M', path: 'tests/setupWindow.ts' },
    { status: 'M', path: 'scripts/ciTestSelection.mjs' },
    { status: 'M', path: '.github/workflows/ci.yml' },
    { status: 'M', path: 'src/style/main.css' },
    { status: 'M', path: 'unknown-config' },
  ]) {
    assert.deepEqual(select([change]), { testFiles: null, lanCompatibility: true, crossPlatform: true });
  }
});

test('main, release, and reusable workflow runs retain full coverage', () => {
  for (const eventName of ['push', 'workflow_call', 'schedule']) {
    assert.deepEqual(select([], [], eventName), { testFiles: null, lanCompatibility: true, crossPlatform: true });
  }
});

test('documentation-only changes have no Jest or platform work', () => {
  assert.deepEqual(select([{ status: 'M', path: 'README.md' }], []), {
    testFiles: [], lanCompatibility: false, crossPlatform: false,
  });
});

test('real prompt dependency graph includes prompt and provider coverage without Collab suites', () => {
  const relatedTests = JSON.parse(execFileSync(process.execPath, [
    'scripts/run-jest.js', '--listTests', '--json', '--findRelatedTests', 'src/core/prompt/mainAgent.ts',
  ], { encoding: 'utf8' }));
  assert.ok(relatedTests.some(file => file.endsWith('/core/prompt/mainAgent.test.ts')));
  assert.ok(relatedTests.some(file => file.includes('/providers/')));
  assert.equal(relatedTests.some(file => /collab/i.test(file)), false);
});
