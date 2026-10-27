#!/usr/bin/env node
/**
 * Ship this plugin: bump the version, run the gates, build, commit, tag and push.
 *
 * GitHub Actions (`.github/workflows/release.yml`) builds again from the tag, attests
 * the artifacts and publishes the release, so the directory picks the new version up.
 * `--dry-run` stops before committing, which is how to rehearse a release.
 *
 * Usage:
 *   node scripts/ship.mjs --bump=patch|minor|major [--notes=file] [--skip-tests] [--dry-run]
 *   node scripts/ship.mjs --version=1.8.1 ...
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => {
  const hit = args.find(arg => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
if (args.includes('--help') || args.includes('-h')) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*\*?/, ''));
  process.exit(0);
}
const dryRun = option('dry-run') === true;
const skipTests = option('skip-tests') === true;
const notesFile = option('notes');

function run(command, commandArgs, options = {}) {
  execFileSync(command, commandArgs, { cwd: ROOT, stdio: 'inherit', ...options });
}

function capture(command, commandArgs) {
  return execFileSync(command, commandArgs, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function fail(message) {
  console.error(`ship: ${message}`);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(join(ROOT, path), `${JSON.stringify(value, null, 2)}\n`);
}

function nextVersion(current, bump) {
  if (typeof bump === 'string' && /^\d+\.\d+\.\d+$/.test(bump)) return bump;
  const [major, minor, patch] = current.split('.').map(Number);
  switch (bump) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default: fail('pass --bump=patch|minor|major, or --version=x.y.z');
  }
}

// ---------------------------------------------------------------- preconditions
if (capture('git', ['status', '--porcelain']) !== '') fail('working tree is not clean');
const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') fail(`on branch ${branch}; releases ship from main`);
run('git', ['fetch', '--quiet', 'origin']);
if (capture('git', ['rev-parse', 'HEAD']) !== capture('git', ['rev-parse', 'origin/main'])) {
  fail('local main differs from origin/main; pull or push first');
}

const manifest = readJson('manifest.json');
const version = nextVersion(manifest.version, option('version') ?? option('bump'));
if (version === manifest.version) fail(`version is already ${version}`);
const tagExists = (() => {
  try {
    capture('git', ['rev-parse', '--verify', `refs/tags/${version}`]);
    return true;
  } catch {
    return false;
  }
})();
if (tagExists) fail(`tag ${version} already exists`);

console.log(`ship: ${manifest.version} -> ${version}${dryRun ? ' (dry run)' : ''}`);

// ------------------------------------------------------------------- versioning
const originals = new Map(
  ['manifest.json', 'package.json', 'package-lock.json', 'versions.json']
    .map(path => [path, existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), 'utf8') : null]),
);

manifest.version = version;
writeJson('manifest.json', manifest);

const pkg = readJson('package.json');
pkg.version = version;
writeJson('package.json', pkg);

const lock = readJson('package-lock.json');
lock.version = version;
if (lock.packages?.['']) lock.packages[''].version = version;
writeJson('package-lock.json', lock);

const versionsPath = join(ROOT, 'versions.json');
const versions = existsSync(versionsPath) ? JSON.parse(readFileSync(versionsPath, 'utf8')) : {};
versions[version] = manifest.minAppVersion;
writeFileSync(versionsPath, `${JSON.stringify(versions, null, 2)}\n`);

// ------------------------------------------------------------------------ gates
run('npm', ['run', 'typecheck']);
run('npm', ['run', 'lint']);
run('npm', ['run', 'test:architecture']);
if (!skipTests) run('npx', ['jest', '--silent']);
run('npm', ['run', 'build']);

if (dryRun) {
  for (const [path, content] of originals) {
    if (content !== null) writeFileSync(join(ROOT, path), content);
  }
  console.log(`ship: dry run complete. ${version} passed every gate; the version files were restored.`);
  process.exit(0);
}

// ------------------------------------------------------------- commit, tag, push
run('git', ['add', '-A']);
run('git', ['commit', '-q', '-m', `chore(release): ${version}`]);
const tagArgs = ['tag', '-a', version];
if (notesFile) tagArgs.push('-F', notesFile);
else tagArgs.push('-m', version);
run('git', tagArgs);
run('git', ['push', 'origin', 'main']);
run('git', ['push', 'origin', version]);

// --------------------------------------------------- wait for the release workflow
console.log('ship: waiting for the release workflow to publish the release');
for (let attempt = 0; attempt < 60; attempt += 1) {
  const runs = JSON.parse(capture('gh', [
    'run', 'list', '--workflow', 'release.yml', '--limit', '5',
    '--json', 'databaseId,headBranch,status,conclusion',
  ]));
  const mine = runs.find(entry => entry.headBranch === version);
  if (mine && mine.status === 'completed') {
    if (mine.conclusion !== 'success') fail(`release workflow ${mine.conclusion}`);
    const release = JSON.parse(capture('gh', ['release', 'view', version, '--json', 'isDraft,assets']));
    const names = release.assets.map(asset => asset.name).sort();
    const expected = ['main.js', 'manifest.json', 'styles.css'];
    if (names.join(',') !== expected.join(',')) fail(`release assets are ${names.join(', ')}`);
    if (release.isDraft) run('gh', ['release', 'edit', version, '--draft=false']);
    console.log(`ship: ${version} is published. Next: community.obsidian.md → the entry → Check for new releases.`);
    process.exit(0);
  }
  // No run yet, or still building: wait a little between polls.
  execFileSync('sleep', ['10']);
}
fail('release workflow did not finish within 10 minutes; check GitHub Actions');
