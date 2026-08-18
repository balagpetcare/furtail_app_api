import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const SECRET = 'change-me-very-secret-access-token-key-12345';
const BASE = 'http://localhost:7300/api/v1';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}
function mintToken(sub: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub, iss: 'http://localhost:5010', aud: 'furtail', client_id: 'furtail', iat: now, exp: now + 3600 };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sig = createHmac('sha256', SECRET).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

async function checkMedia(label: string, url: string) {
  const full = url.startsWith('http') ? url : `http://localhost:7300${url}`;
  const res = await fetch(full);
  console.log(
    `${label}: url=${full} status=${res.status} content-type=${res.headers.get('content-type')} corp=${res.headers.get('cross-origin-resource-policy')} content-length=${res.headers.get('content-length')}`,
  );
}

async function main() {
  const token = mintToken(`browser-repro-verify-${randomUUID()}`);
  const headers = { Authorization: `Bearer ${token}` };

  // === The two ORIGINAL failing posts, re-checked post-fix ===
  console.log('=== Post 1 (Amina Rahman, image, legacy seed) ===');
  const p1 = await (await fetch(`${BASE}/posts/1`, { headers })).json();
  await checkMedia('post 1 media[0]', p1.data.media[0].media.url);

  console.log('\n=== Post 2 (Zara Khan, video, legacy seed) ===');
  const p2 = await (await fetch(`${BASE}/posts/2`, { headers })).json();
  await checkMedia('post 2 media[0]', p2.data.media[0].media.url);

  // === A genuinely real (non-legacy) image + video, uploaded fresh ===
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const imgForm = new FormData();
  imgForm.append('file', new Blob([Buffer.from(pngBase64, 'base64')], { type: 'image/png' }), 'real-repro.png');
  imgForm.append('purpose', 'post');
  const uploadImg = await (
    await fetch(`${BASE}/media/upload`, { method: 'POST', headers, body: imgForm })
  ).json();
  const postImg = await (
    await fetch(`${BASE}/posts`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: 'CORP fix repro — real image', mediaIds: [uploadImg.data.id] }),
    })
  ).json();
  console.log(`\n=== New real image post (id=${postImg.data.id}) ===`);
  await checkMedia('real image', postImg.data.media[0].media.url);

  const videoPath = '.media-store/8/1786984324391-5d13af66-ebe/furtail_attach_1786984320782388_1000609677.mp4';
  if (existsSync(videoPath)) {
    const vidForm = new FormData();
    vidForm.append('file', new Blob([readFileSync(videoPath)], { type: 'video/mp4' }), 'real-repro.mp4');
    vidForm.append('purpose', 'post');
    const uploadVid = await (
      await fetch(`${BASE}/media/upload`, { method: 'POST', headers, body: vidForm })
    ).json();
    const postVid = await (
      await fetch(`${BASE}/posts`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: 'CORP fix repro — real video', type: 'VIDEO', mediaIds: [uploadVid.data.id] }),
      })
    ).json();
    console.log(`\n=== New real video post (id=${postVid.data.id}) ===`);
    await checkMedia('real video', postVid.data.media[0].media.url);
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
