import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fullSelection = { testFiles: null, lanCompatibility: true, crossPlatform: true };
const isDocumentation = file => /^(?:docs\/.*|[^/]+\.md)$/.test(file);
const isSourceOrTest = file => /^(?:src\/.*\.tsx?|tests\/(?:unit|integration)\/.*\.tsx?)$/.test(file);
const isCollab = file => /collab/i.test(file);
const needsNativeSmoke = file => /(?:windowsCmdShim|ManagedStdioProcess|PiSubprocess)/.test(file);

export function selectCiTests({ changes, relatedTests, eventName }) {
  if (eventName !== 'pull_request' || changes.some(change =>
    change.status === 'D' || change.path === 'src/main.ts'
    || (!isDocumentation(change.path) && !isSourceOrTest(change.path))
  )) return { ...fullSelection };

  const paths = [...changes.map(change => change.path), ...relatedTests];
  const lanCompatibility = paths.some(isCollab);
  return {
    testFiles: [...new Set(relatedTests)],
    lanCompatibility,
    crossPlatform: lanCompatibility || paths.some(needsNativeSmoke),
  };
}

function main() {
  let changes = [];
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    const { BASE_SHA: base, HEAD_SHA: head } = process.env;
    if (!base || !head) throw new Error('PR test selection requires base and head commits');
    const entries = execFileSync('git', [
      'diff', '--name-status', '-z', '--no-renames', `${base}...${head}`,
    ], { encoding: 'utf8' }).split('\0');
    entries.pop();
    for (let index = 0; index < entries.length; index += 2) {
      changes.push({ status: entries[index], path: entries[index + 1] });
    }
  }

  let selection = selectCiTests({ changes, relatedTests: [], eventName: process.env.GITHUB_EVENT_NAME });
  const inputs = changes.map(change => change.path).filter(isSourceOrTest);
  if (selection.testFiles !== null && inputs.length > 0) {
    const relatedTests = JSON.parse(execFileSync(process.execPath, [
      'scripts/run-jest.js', '--listTests', '--json', '--findRelatedTests', ...inputs,
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))
      .map(file => path.relative(process.cwd(), file).split(path.sep).join('/'));
    selection = selectCiTests({ changes, relatedTests, eventName: process.env.GITHUB_EVENT_NAME });
  }
  const output = [
    `test-files=${JSON.stringify(selection.testFiles)}`,
    `lan=${selection.lanCompatibility}`,
    `cross-platform=${selection.crossPlatform}`,
  ].join('\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
  console.log(output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
