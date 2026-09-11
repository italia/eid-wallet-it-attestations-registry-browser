#!/usr/bin/env node
/**
 * Decrypt a demo issuer_state JWE with the published fake RSA private key.
 *
 *   node scripts/decrypt-issuer-state.mjs --jwe '<compact JWE>'
 *   node scripts/decrypt-issuer-state.mjs --key demo/keys/issuer-state-enc.private.pem --jwe '<JWE>'
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptIssuerState } from '../src/js/offer/offer.js';
import encPrivateJwk from '../demo/keys/issuer-state-enc.private.jwk.json' with { type: 'json' };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let jwe = '';
let keyInput = JSON.stringify(encPrivateJwk);

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--jwe' || arg === '-j') {
    jwe = args[++i] || '';
  } else if (arg === '--key' || arg === '-k') {
    const path = resolve(root, args[++i] || '');
    keyInput = readFileSync(path, 'utf8');
  } else if (arg === '--help' || arg === '-h') {
    process.stdout.write(`Decrypt a demo issuer_state JWE (RSA-OAEP-256 / A256GCM).

Usage:
  node scripts/decrypt-issuer-state.mjs --jwe '<compact JWE>'
  node scripts/decrypt-issuer-state.mjs --key demo/keys/issuer-state-enc.private.pem --jwe '<JWE>'
  printf '%s' '<JWE>' | node scripts/decrypt-issuer-state.mjs

Default key: demo/keys/issuer-state-enc.private.jwk.json
`);
    process.exit(0);
  } else if (!arg.startsWith('-') && !jwe) {
    jwe = arg;
  }
}

if (!jwe || jwe === '-') {
  jwe = readFileSync(0, 'utf8').trim();
}
jwe = String(jwe || '').trim();
if (!jwe) {
  process.stderr.write('Missing JWE. Pass --jwe or pipe the compact token on stdin.\n');
  process.exit(1);
}

const plaintext = await decryptIssuerState(jwe, keyInput);
process.stdout.write(`${plaintext}\n`);
