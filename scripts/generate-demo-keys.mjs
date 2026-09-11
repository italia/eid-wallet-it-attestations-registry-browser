#!/usr/bin/env node
/**
 * Regenerates the published demo key material under demo/keys/.
 * These keys are fake. Never use them in production or with PDND.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createPublicKey } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'demo', 'keys');

function writeJson(path, obj) {
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
}

function pemPair(jwk) {
  const pub = createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
  const priv = createPrivateKey({ key: jwk, format: 'jwk' }).export({ type: 'pkcs8', format: 'pem' });
  return { pub, priv };
}

mkdirSync(dir, { recursive: true });

const enc = await crypto.subtle.generateKey(
  { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['encrypt', 'decrypt'],
);
const encPub = await crypto.subtle.exportKey('jwk', enc.publicKey);
const encPriv = await crypto.subtle.exportKey('jwk', enc.privateKey);
Object.assign(encPub, { kid: 'itw-demo-enc-1', use: 'enc', alg: 'RSA-OAEP-256' });
Object.assign(encPriv, { kid: 'itw-demo-enc-1', use: 'enc', alg: 'RSA-OAEP-256' });

const sig = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const sigPub = await crypto.subtle.exportKey('jwk', sig.publicKey);
const sigPriv = await crypto.subtle.exportKey('jwk', sig.privateKey);
Object.assign(sigPub, { kid: 'itw-demo-sig-1', use: 'sig', alg: 'ES256' });
Object.assign(sigPriv, { kid: 'itw-demo-sig-1', use: 'sig', alg: 'ES256' });

const holder = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const holderPub = await crypto.subtle.exportKey('jwk', holder.publicKey);
const holderPriv = await crypto.subtle.exportKey('jwk', holder.privateKey);
Object.assign(holderPub, { kid: 'itw-demo-holder-1', use: 'sig', alg: 'ES256' });
Object.assign(holderPriv, { kid: 'itw-demo-holder-1', use: 'sig', alg: 'ES256' });

writeJson(join(dir, 'issuer-state-enc.public.jwk.json'), encPub);
writeJson(join(dir, 'issuer-state-enc.private.jwk.json'), encPriv);
writeJson(join(dir, 'issuer-sign.public.jwk.json'), sigPub);
writeJson(join(dir, 'issuer-sign.private.jwk.json'), sigPriv);
writeJson(join(dir, 'holder-cnf.public.jwk.json'), holderPub);
writeJson(join(dir, 'holder-cnf.private.jwk.json'), holderPriv);

const encPem = pemPair(encPriv);
writeFileSync(join(dir, 'issuer-state-enc.public.pem'), encPem.pub);
writeFileSync(join(dir, 'issuer-state-enc.private.pem'), encPem.priv);
const sigPem = pemPair(sigPriv);
writeFileSync(join(dir, 'issuer-sign.public.pem'), sigPem.pub);
writeFileSync(join(dir, 'issuer-sign.private.pem'), sigPem.priv);
const holderPem = pemPair(holderPriv);
writeFileSync(join(dir, 'holder-cnf.public.pem'), holderPem.pub);
writeFileSync(join(dir, 'holder-cnf.private.pem'), holderPem.priv);

writeJson(join(root, 'demo', 'jwks.json'), { keys: [encPub, sigPub, holderPub] });
process.stdout.write('Wrote demo/keys and demo/jwks.json\n');
