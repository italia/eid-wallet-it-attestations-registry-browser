#!/usr/bin/env node
/** Copy cache/ into public/cache/ so Vite emits it on GitHub Pages. */
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'cache');
const to = join(root, 'public', 'cache');

await rm(to, { recursive: true, force: true });
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log('Synced cache/ → public/cache/');
