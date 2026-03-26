#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const targetPath = resolve(process.cwd(), 'dist/content-script.js');

if (!existsSync(targetPath)) {
  console.error('[verify:content] Missing file: dist/content-script.js');
  process.exit(1);
}

const source = readFileSync(targetPath, 'utf8');

try {
  // Classic-script parse check: top-level import/export will throw here.
  // eslint-disable-next-line no-new-func
  new Function(source);
} catch (error) {
  console.error('[verify:content] content-script.js is not a valid classic script.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const blockedPatterns = [
  { name: 'import.meta', regex: /import\.meta/ },
  { name: '__vite_legacy_guard', regex: /__vite_legacy_guard/ },
];

const matched = blockedPatterns.find(({ regex }) => regex.test(source));
if (matched) {
  console.error(`[verify:content] Found blocked pattern in content-script.js: ${matched.name}`);
  process.exit(1);
}

console.log('[verify:content] OK: dist/content-script.js is classic-script safe.');
