import esbuild from 'esbuild';
import { builtinModules } from 'node:module';
import path from 'path';
import process from 'process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  promises as fsPromises,
  readFileSync,
} from 'fs';
import { assertRuntimeDependencyParity } from './scripts/runtimeDependencyParity.mjs';
import rendererSafeUnrefHelpers from './scripts/rendererSafeUnref.js';
import desktopRuntimeAliasHelpers from './scripts/desktopRuntimeAliases.js';
import compressedStaticAssetsHelpers from './scripts/compressedStaticAssets.js';

const {
  findUnsafeTimerUnrefSites,
  patchRendererUnsafeUnrefSites,
} = rendererSafeUnrefHelpers;
const { createDesktopRuntimeAliases } = desktopRuntimeAliasHelpers;
const { createCompressedStaticAssetsPlugin } = compressedStaticAssetsHelpers;

// Load .env.local if it exists
if (existsSync('.env.local')) {
  const envContent = readFileSync('.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=["']?(.+?)["']?$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const prod = process.argv[2] === 'production';
if (prod) assertRuntimeDependencyParity(process.cwd());

function createPatchRendererUnsafeUnref(outputPaths) {
  return {
    name: 'patch-renderer-unsafe-unref',
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length > 0) return;

        for (const outputPath of outputPaths) {
          if (!existsSync(outputPath)) continue;
          const bundlePath = path.join(process.cwd(), outputPath);
          const originalContents = await fsPromises.readFile(bundlePath, 'utf8');
          const patchedBundle = patchRendererUnsafeUnrefSites(originalContents);

          if (patchedBundle.contents !== originalContents) {
            await fsPromises.writeFile(bundlePath, patchedBundle.contents, 'utf8');
          }

          const unsafeMatches = findUnsafeTimerUnrefSites(patchedBundle.contents);
          if (unsafeMatches.length > 0) {
            const details = unsafeMatches
              .slice(0, 5)
              .map((match) => `line ${match.line}: ${match.snippet}`)
              .join('\n');

            throw new Error(
              `Renderer-unsafe timer .unref() calls remain in ${outputPath}:\n${details}`,
            );
          }
        }
      });
    },
  };
}

// Obsidian plugin folder path (set via OBSIDIAN_VAULT env var or .env.local)
const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT;
const OBSIDIAN_PLUGIN_PATH = OBSIDIAN_VAULT && existsSync(OBSIDIAN_VAULT)
  ? path.join(OBSIDIAN_VAULT, '.obsidian', 'plugins', 'super-useful-claudian')
  : null;

// Plugin to copy built files to Obsidian plugin folder
const copyToObsidian = {
  name: 'copy-to-obsidian',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      if (!OBSIDIAN_PLUGIN_PATH) return;

      if (!existsSync(OBSIDIAN_PLUGIN_PATH)) {
        mkdirSync(OBSIDIAN_PLUGIN_PATH, { recursive: true });
      }

      const files = ['main.js', 'manifest.json', 'styles.css'];
      for (const file of files) {
        if (existsSync(file)) {
          copyFileSync(file, path.join(OBSIDIAN_PLUGIN_PATH, file));
          console.log(`Copied ${file} to Obsidian plugin folder`);
        }
      }
    });
  }
};

const external = [
  'obsidian',
  'electron',
  '@codemirror/autocomplete',
  '@codemirror/collab',
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/lint',
  '@codemirror/search',
  '@codemirror/state',
  '@codemirror/view',
  '@lezer/common',
  '@lezer/highlight',
  '@lezer/lr',
  ...builtinModules,
  // Older build hosts omit prefix-only modules such as node:sqlite from builtinModules.
  'node:*',
];

const mainContext = await esbuild.context({
  entryPoints: ['src/main.ts'],
  alias: {
    ...createDesktopRuntimeAliases(),
  },
  bundle: true,
  plugins: [
    createCompressedStaticAssetsPlugin(),
    createPatchRendererUnsafeUnref(['main.js']),
    copyToObsidian,
  ],
  external,
  format: 'cjs',
  loader: { '.wasm': 'binary' },
  target: 'es2022',
  charset: 'utf8',
  logLevel: 'info',
  minify: prod,
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
});

if (prod) {
  await mainContext.rebuild();
  process.exit(0);
} else {
  await mainContext.watch();
}
