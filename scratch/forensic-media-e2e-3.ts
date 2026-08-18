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

  const adoptionRes = await fetch(`${BASE}/adoption/feed?limit=2`, { headers });
  const adoption = await adoptionRes.json();
  console.log('=== Adoption item[0] full JSON ===');
  console.log(JSON.stringify(adoption?.data?.items?.[0] ?? adoption?.items?.[0], null, 2));

  const fundraisingRes = await fetch(`${BASE}/fundraising/feed?limit=2`, { headers });
  const fundraising = await fundraisingRes.json();
  console.log('\n=== Fundraising item[0] full JSON ===');
  console.log(JSON.stringify(fundraising?.data?.items?.[0] ?? fundraising?.items?.[0], null, 2));

  // Now resolve and curl the FIRST media URL found in each, exactly like the frontend would.
  function extractFirstUrl(obj: any): string | undefined {
    const list = obj?.media;
    if (Array.isArray(list) && list.length > 0) {
      const m = list[0];
      return m?.media?.url ?? m?.url;
    }
    return obj?.coverImageUrl ?? undefined;
  }
  const adoptionItem = adoption?.data?.items?.[0] ?? adoption?.items?.[0];
  const fundraisingItem = fundraising?.data?.items?.[0] ?? fundraising?.items?.[0];
  const adoptionUrl = extractFirstUrl(adoptionItem);
  const fundraisingUrl = extractFirstUrl(fundraisingItem);
  console.log('\nAdoption first media URL:', adoptionUrl);
  console.log('Fundraising first media URL:', fundraisingUrl);

  for (const [label, url] of [['adoption', adoptionUrl], ['fundraising', fundraisingUrl]] as const) {
    if (!url) { console.log(`${label}: no media url present`); continue; }
    const full = url.startsWith('http') ? url : `http://localhost:7300${url}`;
    const res = await fetch(full);
    console.log(`${label} fetch ${full} -> status ${res.status}, content-type ${res.headers.get('content-type')}`);
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
