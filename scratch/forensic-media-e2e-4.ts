import { createHmac, randomUUID } from 'node:crypto';

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

async function main() {
  const token = mintToken(`forensic-${randomUUID()}`);
  const headers = { Authorization: `Bearer ${token}` };

  const adoptionRes = await fetch(`${BASE}/adoption/feed?limit=20`, { headers });
  const adoption = await adoptionRes.json();
  const items = adoption?.data?.items ?? adoption?.items ?? [];
  console.log(`Total adoption items: ${items.length}`);
  for (const it of items) {
    console.log(`id=${it.id} petName=${it.petName} media.length=${it.media?.length} coverImageUrl=${it.coverImageUrl}`);
  }

  const withMedia = items.find((it: any) => it.media?.length > 0);
  if (withMedia) {
    console.log('\n=== Found adoption item with media ===');
    console.log(JSON.stringify(withMedia.media, null, 2));
    const first = withMedia.media[0];
    const url = first?.media?.url ?? first?.url;
    console.log('resolved url:', url);
    if (url) {
      const res = await fetch(`http://localhost:7300${url}`);
      console.log('fetch status:', res.status, 'content-type:', res.headers.get('content-type'));
    }
  } else {
    console.log('\nNo adoption items with media found in this feed page.');
  }

  const fundraisingRes = await fetch(`${BASE}/fundraising/feed?limit=20`, { headers });
  const fundraising = await fundraisingRes.json();
  const fItems = fundraising?.data?.items ?? fundraising?.items ?? [];
  console.log(`\nTotal fundraising items: ${fItems.length}`);
  for (const it of fItems) {
    console.log(`id=${it.id} title=${it.title?.slice(0,30)} media.length=${it.media?.length}`);
  }
  const fWithMedia = fItems.find((it: any) => it.media?.length > 0);
  if (fWithMedia) {
    console.log('\n=== Found fundraising item with media ===');
    console.log(JSON.stringify(fWithMedia.media, null, 2));
    const first = fWithMedia.media[0];
    const url = first?.url ?? first?.media?.url;
    console.log('resolved url:', url);
    if (url) {
      const res = await fetch(`http://localhost:7300${url}`);
      console.log('fetch status:', res.status, 'content-type:', res.headers.get('content-type'));
    }
  } else {
    console.log('\nNo fundraising items with media found in this feed page.');
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
