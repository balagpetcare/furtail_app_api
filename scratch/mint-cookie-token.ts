import { createHmac, randomUUID } from 'node:crypto';

const SECRET = 'change-me-very-secret-access-token-key-12345';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

const sub = process.argv[2] || `browser-repro-${randomUUID()}`;
const header = { alg: 'HS256', typ: 'JWT' };
const now = Math.floor(Date.now() / 1000);
const payload = { sub, iss: 'http://localhost:5010', aud: 'furtail', client_id: 'furtail', iat: now, exp: now + 3600 };
const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
const sig = createHmac('sha256', SECRET).update(signingInput).digest('base64url');
console.log(`${signingInput}.${sig}`);
