import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

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
  const payload = { sub, iss: ISSUER, aud: AUD, client_id: AUD, iat: now, exp: now + 3600 };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sig = createHmac('sha256', SECRET).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

async function main() {
  const sub = `forensic-${randomUUID()}`;
  const token = mintToken(sub);
  const authHeaders = { Authorization: `Bearer ${token}` };

  // Find a real small mp4 already on disk to reuse as a real video upload.
  const candidatePaths = [
    '.media-store/8/1786984324391-5d13af66-ebe/furtail_attach_1786984320782388_1000609677.mp4',
  ];
  const videoPath = candidatePaths.find((p) => existsSync(p));
  console.log('Using video file:', videoPath);

  if (videoPath) {
    const videoBuffer = readFileSync(videoPath);
    console.log('\n=== Upload real video ===');
    const vidForm = new FormData();
    vidForm.append('file', new Blob([videoBuffer], { type: 'video/mp4' }), 'forensic-test.mp4');
    vidForm.append('purpose', 'post');
    const uploadVidRes = await fetch(`${BASE}/media/upload`, { method: 'POST', headers: authHeaders, body: vidForm });
    const uploadVid = await uploadVidRes.json();
    console.log('status:', uploadVidRes.status);
    console.log(JSON.stringify(uploadVid, null, 2));

    const vidMediaId = uploadVid?.data?.id ?? uploadVid?.id;
    console.log('\n=== Create post with video ===');
    const createRes = await fetch(`${BASE}/posts`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: 'Forensic media audit test post (video)', type: 'VIDEO', mediaIds: [vidMediaId] }),
    });
    const created = await createRes.json();
    console.log('status:', createRes.status);
    console.log(JSON.stringify(created, null, 2));

    console.log('\n=== GET /posts/videos ===');
    const videosRes = await fetch(`${BASE}/posts/videos?limit=5`, { headers: authHeaders });
    const videos = await videosRes.json();
    console.log('status:', videosRes.status);
    console.log(JSON.stringify(videos, null, 2).slice(0, 3000));

    const vidUrl = uploadVid?.data?.url ?? uploadVid?.url;
    if (vidUrl) {
      console.log('\n=== Fetch the real video URL directly ===');
      const check = await fetch(`http://localhost:7300${vidUrl}`);
      console.log('status:', check.status, 'content-type:', check.headers.get('content-type'), 'content-length:', check.headers.get('content-length'));
    }
  }

  console.log('\n=== Existing post id=4 (pre-existing, from prior session) ===');
  const p4 = await fetch(`${BASE}/posts/4`, { headers: authHeaders });
  console.log('status:', p4.status);
  console.log(JSON.stringify(await p4.json(), null, 2).slice(0, 2000));

  console.log('\n=== Stories feed ===');
  const storiesRes = await fetch(`${BASE}/stories/feed`, { headers: authHeaders });
  console.log('status:', storiesRes.status);
  console.log(JSON.stringify(await storiesRes.json(), null, 2).slice(0, 2000));

  console.log('\n=== Adoption feed (shape check) ===');
  const adoptionRes = await fetch(`${BASE}/adoption/feed?limit=3`, { headers: authHeaders });
  console.log('status:', adoptionRes.status);
  console.log(JSON.stringify(await adoptionRes.json(), null, 2).slice(0, 2500));

  console.log('\n=== Fundraising feed (shape check) ===');
  const fundraisingRes = await fetch(`${BASE}/fundraising/feed?limit=3`, { headers: authHeaders });
  console.log('status:', fundraisingRes.status);
  console.log(JSON.stringify(await fundraisingRes.json(), null, 2).slice(0, 2500));
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
