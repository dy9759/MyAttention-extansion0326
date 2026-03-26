#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const argSet = new Set(argv);
  if (argSet.has('--no-clean-release')) {
    return { cleanRelease: false };
  }
  return { cleanRelease: true };
}

function cleanOldReleaseDirs(releaseRoot, currentReleaseDirName) {
  if (!existsSync(releaseRoot)) {
    return [];
  }

  const removedDirs = [];
  const entries = readdirSync(releaseRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!entry.name.startsWith('saysoattention-v')) {
      continue;
    }
    if (entry.name === currentReleaseDirName) {
      continue;
    }

    rmSync(resolve(releaseRoot, entry.name), { recursive: true, force: true });
    removedDirs.push(entry.name);
  }

  return removedDirs;
}

function main() {
  const rootDir = process.cwd();
  const distDir = resolve(rootDir, 'dist');
  const packagePath = resolve(rootDir, 'package.json');
  const { cleanRelease } = parseArgs(process.argv.slice(2));

  if (!existsSync(distDir)) {
    throw new Error('dist 目录不存在，请先执行 npm run build');
  }

  const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
  const version = pkg.version || '0.0.0';

  const releaseRoot = resolve(rootDir, 'release');
  const releaseDirName = `saysoattention-v${version}`;
  const releaseDir = resolve(releaseRoot, releaseDirName);

  mkdirSync(releaseRoot, { recursive: true });
  const removedDirs = cleanRelease ? cleanOldReleaseDirs(releaseRoot, releaseDirName) : [];
  rmSync(releaseDir, { recursive: true, force: true });
  cpSync(distDir, releaseDir, { recursive: true });

  console.log(`[build:chrome] 已生成发布目录: ${releaseDir}`);
  if (cleanRelease) {
    if (removedDirs.length > 0) {
      console.log(`[build:chrome] 已清理旧发布目录: ${removedDirs.join(', ')}`);
    } else {
      console.log('[build:chrome] 未发现可清理的旧发布目录');
    }
  } else {
    console.log('[build:chrome] 已跳过旧发布目录清理 (--no-clean-release)');
  }
}

main();
