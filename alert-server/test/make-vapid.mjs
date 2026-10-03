// one-off: make the VAPID key pair; private half -> .dev.vars (never committed), public half -> vapid-public.txt
// run from alert-server/: node test/make-vapid.mjs   (refuses to run twice)
import { existsSync, renameSync, writeFileSync } from 'node:fs';
if (existsSync('.dev.vars')) { console.log('.dev.vars มีอยู่แล้ว ไม่สร้างใหม่'); process.exit(0); }
const { privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const jwk = await crypto.subtle.exportKey('jwk', privateKey);
const b = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const pub = btoa(String.fromCharCode(4, ...b(jwk.x), ...b(jwk.y))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
writeFileSync('.dev.vars.tmp', `VAPID_PRIVATE='${JSON.stringify(jwk)}'\n`, 'utf8');
renameSync('.dev.vars.tmp', '.dev.vars');
writeFileSync('vapid-public.txt', pub + '\n', 'utf8');
console.log('public key:', pub);
