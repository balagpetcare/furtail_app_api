import { createHmac, randomUUID } from 'node:crypto';

const SECRET = 'change-me-very-secret-access-token-key-12345';
const ISSUER = 'http://localhost:5010';
const AUD = 'furtail';
const BASE = 'http://localhost:7300/api/v1';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function mintToken(sub: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub,
    iss: ISSUER,
    aud: AUD,
    client_id: AUD,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sig = createHmac('sha256', SECRET).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

async function main() {
  const sub = `forensic-${randomUUID()}`;
  const token = mintToken(sub);
  const authHeaders = { Authorization: `Bearer ${token}` };

  console.log('=== 1. Auth bootstrap ===');
  const meRes = await fetch(`${BASE}/auth/me`, { headers: authHeaders });
  const me = await meRes.json();
  console.log('status:', meRes.status);
  console.log(JSON.stringify(me, null, 2));

  console.log('\n=== 2. Upload a real 1x1 PNG image ===');
  // Minimal valid 1x1 red PNG
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const pngBuffer = Buffer.from(pngBase64, 'base64');
  const imgForm = new FormData();
  imgForm.append('file', new Blob([pngBuffer], { type: 'image/png' }), 'forensic-test.png');
  imgForm.append('purpose', 'post');
  const uploadImgRes = await fetch(`${BASE}/media/upload`, {
    method: 'POST',
    headers: authHeaders,
    body: imgForm,
  });
  const uploadImg = await uploadImgRes.json();
  console.log('status:', uploadImgRes.status);
  console.log(JSON.stringify(uploadImg, null, 2));

  console.log('\n=== 3. Create a post with that image ===');
  const imgMediaId = uploadImg?.data?.id ?? uploadImg?.id;
  const createPostRes = await fetch(`${BASE}/posts`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ caption: 'Forensic media audit test post (image)', mediaIds: [imgMediaId] }),
  });
  const createdPost = await createPostRes.json();
  console.log('status:', createPostRes.status);
  console.log(JSON.stringify(createdPost, null, 2));

  console.log('\n=== 4. GET /posts/feed — inspect real media shape ===');
  const feedRes = await fetch(`${BASE}/posts/feed?limit=5`, { headers: authHeaders });
  const feed = await feedRes.json();
  console.log('status:', feedRes.status);
  console.log(JSON.stringify(feed, null, 2));

  console.log('\n=== 5. GET /posts/:id — single post ===');
  const postId = createdPost?.data?.id ?? createdPost?.id;
  const singleRes = await fetch(`${BASE}/posts/${postId}`, { headers: authHeaders });
  const single = await singleRes.json();
  console.log('status:', singleRes.status);
  console.log(JSON.stringify(single, null, 2));

  await prismaDisconnectNoop();
}

async function prismaDisconnectNoop() {}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
