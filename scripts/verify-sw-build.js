#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TARGET_FILES = ['dist/background.js', 'dist/background-legacy.js'];
const FORBIDDEN_PATTERNS = [
  /importScripts\(/g,
  /window\./g,
  /document\./g,
  /__vite__mapDeps/g,
  /modulepreload/g,
];

function collectMatches(content) {
  const hits = [];

  for (const pattern of FORBIDDEN_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match = regex.exec(content);

    while (match) {
      const index = match.index;
      const lineStart = content.lastIndexOf('\n', index) + 1;
      const lineEnd = content.indexOf('\n', index);
      const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim();
      hits.push({
        pattern: pattern.source,
        snippet: line.slice(0, 180),
      });
      match = regex.exec(content);
    }
  }

  return hits;
}

function main() {
  const root = process.cwd();
  let hasViolation = false;

  for (const relativePath of TARGET_FILES) {
    const filePath = resolve(root, relativePath);

    if (!existsSync(filePath)) {
      console.error(`[verify:sw] Missing build artifact: ${relativePath}`);
      hasViolation = true;
      continue;
    }

    const content = readFileSync(filePath, 'utf-8');
    const matches = collectMatches(content);

    if (matches.length === 0) {
      console.log(`[verify:sw] OK: ${relativePath}`);
      continue;
    }

    hasViolation = true;
    console.error(`[verify:sw] FAILED: ${relativePath}`);
    matches.forEach((hit, idx) => {
      console.error(`  ${idx + 1}. pattern=${hit.pattern}`);
      console.error(`     snippet: ${hit.snippet}`);
    });
  }

  if (hasViolation) {
    process.exit(1);
  }

  console.log('[verify:sw] All service worker artifacts passed.');
}

main();
