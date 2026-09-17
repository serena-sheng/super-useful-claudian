const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const args = process.argv.slice(2);
let selectedTests = null;
if (args[0] === '--selection') {
  selectedTests = JSON.parse(args[1]);
  args.splice(0, 2);
  if (selectedTests !== null && (!Array.isArray(selectedTests)
    || selectedTests.some(file => typeof file !== 'string' || !file.startsWith('tests/')))) {
    throw new Error('Test selection must be null or an array of repository test paths');
  }
}
if (selectedTests === null || selectedTests.length > 0) {
  run([
    path.join(__dirname, 'run-jest.js'),
    ...args,
    ...(selectedTests === null ? [] : ['--runTestsByPath', ...selectedTests]),
  ]);
}
run([
  '--test',
  path.join(__dirname, 'check-architecture-boundaries.test.mjs'),
  path.join(__dirname, 'check-eslint-config.test.mjs'),
  path.join(__dirname, 'check-open-handles.test.mjs'),
  path.join(__dirname, 'check-release-version.test.mjs'),
  path.join(__dirname, 'check-stylelint-config.test.mjs'),
  path.join(__dirname, 'summarize-jest-results.test.mjs'),
  path.join(__dirname, 'ciTestSelection.test.mjs'),
]);
