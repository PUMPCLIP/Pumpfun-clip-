import crypto from 'node:crypto';

const baseUrl = process.env.CREDIT_TEST_BASE_URL || 'http://localhost:3000';
const parsedBase = new URL(baseUrl);
if (!['localhost', '127.0.0.1'].includes(parsedBase.hostname) || parsedBase.protocol !== 'http:') {
  throw new Error('Refusing to run credit smoke test outside plain HTTP localhost. Use CREDIT_TEST_BASE_URL=http://localhost:3000.');
}

const role = process.env.CREDIT_TEST_ROLE || 'clipper';
const sourceUrl = process.env.CREDIT_TEST_SOURCE_URL || 'https://www.youtube.com/watch?v=r1dkV28CCcw';
const headers = {'origin': baseUrl.replace(/\/$/, ''), 'content-type': 'application/json'};
let cookies = '';
let csrf = '';

function captureCookies(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') || '').split(/,(?=[^;]+?=)/);
  const jar = new Map(cookies.split('; ').filter(Boolean).map(value => value.split('=')));
  for (const value of values) {
    const [name, token] = value.split(';', 1)[0].split('=');
    if (name && token) jar.set(name, token);
  }
  cookies = [...jar.entries()].map(([name, token]) => `${name}=${token}`).join('; ');
  const csrfPair = [...jar.entries()].find(([name]) => name === 'pc_csrf');
  csrf = csrfPair?.[1] || '';
}

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {...headers, ...(cookies ? {cookie: cookies} : {}), ...(init.headers || {})},
  });
  captureCookies(response);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path} → ${response.status} ${data.code || data.message || ''}`.trim());
  return data;
}

const auth = await request('/api/v1/auth/dev', {method: 'POST', body: JSON.stringify({role})});
if (!auth.development) throw new Error('Development authentication was not enabled. Start the app with ALLOW_DEV_AUTH=true and SOLANA_CLUSTER=devnet.');

const before = await request('/api/v1/ai/usage');
if (Number(before.balance_units) + Number(before.free_units) < 5) {
  throw new Error(`Insufficient local test credits: free=${before.free_units}, paid=${before.balance_units}. Seed a test account/plan before running.`);
}

const key = crypto.randomUUID();
const queued = await request('/api/v1/ai/clips', {
  method: 'POST',
  headers: {'x-csrf-token': csrf, 'idempotency-key': key},
  body: JSON.stringify({sourceUrl, rightsConfirmed: true, aspectRatio: '9:16', instructions: ''}),
});
const afterQueue = await request('/api/v1/ai/usage');
const beforeAvailable = Number(before.free_units) + Number(before.balance_units);
const afterAvailable = Number(afterQueue.free_units) + Number(afterQueue.balance_units);
if (beforeAvailable - afterAvailable !== 5) {
  throw new Error(`Expected a 5-credit reservation, observed ${beforeAvailable - afterAvailable}. job=${queued.id}`);
}

let status = queued.status;
let final = queued;
const deadline = Date.now() + Number(process.env.CREDIT_TEST_TIMEOUT_MS || 180000);
while (['queued', 'processing'].includes(status) && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 2500));
  const jobs = await request('/api/v1/ai/clips');
  final = jobs.items.find(item => item.id === queued.id) || final;
  status = final.status;
}
if (['queued', 'processing'].includes(status)) throw new Error(`Timed out waiting for job ${queued.id}; latest status=${status}`);

const afterSettlement = await request('/api/v1/ai/usage');
const settledAvailable = Number(afterSettlement.free_units) + Number(afterSettlement.balance_units);
const expectedFinal = status === 'failed' ? beforeAvailable : beforeAvailable - 5;
if (settledAvailable !== expectedFinal) {
  throw new Error(`Balance settlement mismatch: status=${status}, expected available=${expectedFinal}, observed=${settledAvailable}`);
}

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  userRole: role,
  jobId: queued.id,
  status,
  before: {free: Number(before.free_units), paid: Number(before.balance_units), available: beforeAvailable},
  afterQueue: {free: Number(afterQueue.free_units), paid: Number(afterQueue.balance_units), available: afterAvailable},
  afterSettlement: {free: Number(afterSettlement.free_units), paid: Number(afterSettlement.balance_units), available: settledAvailable},
  reservationDelta: beforeAvailable - afterAvailable,
  expectedReservation: 5,
  settlement: status === 'failed' ? 'released' : 'consumed',
}, null, 2));
