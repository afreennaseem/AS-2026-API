// Equivalence Partitioning tests for the checkout discount business rule.
//
// Rule under test (README "Business rules" 1-3, swagger /checkout):
//   - paymentMethod = "cash"        -> discount = 10% of cart subtotal
//   - paymentMethod = "credit_card" -> discount = 0
//   - any other paymentMethod       -> 400
//
// Usage: BASE_URL=http://localhost:3000 node tests/discount-ep.js [seed]
// Run against a freshly started server (seed data from README).

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SEED = Number(process.argv[2]) || Date.now() % 1e9;
const REPORT_DIR = path.join(__dirname, '..', 'reports');

// ---------- seeded RNG so a run can be reproduced ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const randInt = (min, max) => min + Math.floor(rnd() * (max - min + 1));

// ---------- test data from README ----------
const USERS = {
  alice: { email: 'alice@example.com', password: 'alice123' },
  bob: { email: 'bob@example.com', password: 'bob123' },
  carol: { email: 'carol@example.com', password: 'carol123' },
};
const PRODUCTS = [
  { id: 1, name: 'Wireless Mouse', price: 25.0, stock: 50 },
  { id: 2, name: 'Mechanical Keyboard', price: 80.0, stock: 30 },
  { id: 3, name: 'USB-C Monitor', price: 200.0, stock: 10 },
];
const round = (n) => Math.round(n * 100) / 100;

// ---------- partitions ----------
const PARTITIONS = [
  { id: 'EP1', input: 'paymentMethod', type: 'Valid', name: 'cash',
    domain: '{ "cash" }', expected: '201, discount = 10% of subtotal, total = subtotal - discount' },
  { id: 'EP2', input: 'paymentMethod', type: 'Valid', name: 'credit_card',
    domain: '{ "credit_card" }', expected: '201, discount = 0, total = subtotal' },
  { id: 'EP3', input: 'paymentMethod', type: 'Invalid', name: 'String outside the allowed set',
    domain: 'any string ∉ { "cash", "credit_card" }', expected: '400, no order created, cart kept' },
  { id: 'EP4', input: 'paymentMethod', type: 'Invalid', name: 'Non-string value',
    domain: 'number, boolean, null, array, object', expected: '400, no order created, cart kept' },
  { id: 'EP5', input: 'paymentMethod', type: 'Invalid', name: 'Field absent',
    domain: 'request body without paymentMethod', expected: '400, no order created, cart kept' },
  { id: 'EP6', input: 'cart subtotal', type: 'Valid', name: 'Subtotal > 0 (non-empty cart)',
    domain: 'subtotal > 0', expected: 'discount rule is applied (covered by EP1/EP2)' },
  { id: 'EP7', input: 'cart subtotal', type: 'Invalid', name: 'Subtotal = 0 (empty cart)',
    domain: 'cart has no items', expected: '400 "Cart is empty", no discount computed' },
];

// Pools representing each invalid partition; one value is drawn at random.
const INVALID_STRINGS = ['paypal', 'bitcoin', 'debit_card', 'bank_transfer', 'voucher', 'Cash', 'CREDIT_CARD', 'cash ', '', 'credit card'];
const NON_STRINGS = [0, 10, -1, 3.14, true, false, null, ['cash'], { method: 'cash' }];

// ---------- HTTP with evidence capture ----------
async function call(method, urlPath, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const started = Date.now();
  const res = await fetch(BASE_URL + urlPath, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return {
    request: {
      method, url: BASE_URL + urlPath,
      headers: token ? { ...headers, Authorization: `Bearer ${token.slice(0, 16)}…` } : headers,
      body,
    },
    response: { status: res.status, body: json },
    timestamp: new Date(started).toISOString(),
    durationMs: Date.now() - started,
  };
}

async function login(user) {
  const ex = await call('POST', '/api/login', { body: USERS[user] });
  if (ex.response.status !== 200) throw new Error(`Login failed for ${user}: ${JSON.stringify(ex.response.body)}`);
  return { token: ex.response.body.token, evidence: ex };
}

// Random cart: 1-3 distinct products with random quantities (kept well under stock).
function randomCart() {
  const count = randInt(1, 3);
  const chosen = [...PRODUCTS].sort(() => rnd() - 0.5).slice(0, count);
  return chosen.map((p) => ({ productId: p.id, quantity: randInt(1, Math.min(5, p.stock)) }));
}
const expectedSubtotal = (items) =>
  round(items.reduce((s, i) => s + PRODUCTS.find((p) => p.id === i.productId).price * i.quantity, 0));

async function fillCart(token, items, evidence) {
  for (const item of items) {
    const ex = await call('POST', '/api/cart', { token, body: item });
    evidence.push({ step: `Setup: add product ${item.productId} x${item.quantity}`, ...ex });
    if (ex.response.status !== 200) throw new Error(`Cart setup failed: ${JSON.stringify(ex.response.body)}`);
  }
}

function check(checks, label, expected, actual) {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  checks.push({ label, expected, actual, pass });
  return pass;
}

// ---------- test cases ----------
async function validCase(id, user, method, rate) {
  const evidence = []; const checks = [];
  const { token, evidence: loginEx } = await login(user);
  evidence.push({ step: `Setup: login as ${USERS[user].email}`, ...loginEx });
  const items = randomCart();
  await fillCart(token, items, evidence);
  const sub = expectedSubtotal(items);
  const disc = round(sub * rate);

  const ex = await call('POST', '/api/checkout', { token, body: { paymentMethod: method } });
  evidence.push({ step: 'Action: checkout', ...ex });
  const b = ex.response.body || {};
  check(checks, 'HTTP status', 201, ex.response.status);
  check(checks, 'subtotal', sub, b.subtotal);
  check(checks, 'paymentMethod echoed', method, b.paymentMethod);
  check(checks, `discount (${rate * 100}% of ${sub})`, disc, b.discount);
  check(checks, 'total = subtotal - discount', round(sub - disc), b.total);

  return { partitions: [id, 'EP6'], user, value: JSON.stringify(method), cart: items, checks, evidence };
}

async function invalidValueCase(id, user, bodyBuilder, valueLabel) {
  const evidence = []; const checks = [];
  const { token, evidence: loginEx } = await login(user);
  evidence.push({ step: `Setup: login as ${USERS[user].email}`, ...loginEx });
  // Make sure the cart is non-empty so only paymentMethod can cause the 400.
  const before = await call('GET', '/api/cart', { token });
  let items = [];
  if (!before.response.body.items.length) {
    items = [{ productId: pick(PRODUCTS).id, quantity: randInt(1, 3) }];
    await fillCart(token, items, evidence);
  } else {
    evidence.push({ step: 'Setup: cart already populated', ...before });
  }
  const cartBefore = (await call('GET', '/api/cart', { token })).response.body;

  const ex = await call('POST', '/api/checkout', { token, body: bodyBuilder() });
  evidence.push({ step: 'Action: checkout', ...ex });
  check(checks, 'HTTP status', 400, ex.response.status);
  check(checks, 'error message', "paymentMethod must be 'cash' or 'credit_card'", ex.response.body && ex.response.body.error);
  check(checks, 'no discount / order in response', undefined, ex.response.body && ex.response.body.discount);

  const after = await call('GET', '/api/cart', { token });
  evidence.push({ step: 'Verify: cart unchanged after rejected checkout', ...after });
  check(checks, 'cart unchanged', cartBefore, after.response.body);

  return { partitions: [id], user, value: valueLabel, cart: cartBefore.items.map(({ productId, quantity }) => ({ productId, quantity })), checks, evidence };
}

async function emptyCartCase(user) {
  const evidence = []; const checks = [];
  const { token, evidence: loginEx } = await login(user);
  evidence.push({ step: `Setup: login as ${USERS[user].email}`, ...loginEx });
  const cart = await call('GET', '/api/cart', { token });
  evidence.push({ step: 'Setup: confirm cart is empty', ...cart });
  check(checks, 'precondition: cart empty', 0, cart.response.body.items.length);
  const method = pick(['cash', 'credit_card']);
  const ex = await call('POST', '/api/checkout', { token, body: { paymentMethod: method } });
  evidence.push({ step: 'Action: checkout', ...ex });
  check(checks, 'HTTP status', 400, ex.response.status);
  check(checks, 'error message', 'Cart is empty', ex.response.body && ex.response.body.error);
  check(checks, 'no discount in response', undefined, ex.response.body && ex.response.body.discount);
  return { partitions: ['EP7'], user, value: `${JSON.stringify(method)} with empty cart`, cart: [], checks, evidence };
}

// ---------- run ----------
(async () => {
  const titles = {
    EP1: 'Cash payment applies 10% discount',
    EP2: 'Credit card payment applies no discount',
    EP3: 'Unknown payment method string is rejected',
    EP4: 'Non-string payment method is rejected',
    EP5: 'Missing payment method is rejected',
    EP7: 'Checkout of empty cart is rejected',
  };
  const invalidString = pick(INVALID_STRINGS);
  const nonString = pick(NON_STRINGS);
  const absentBody = pick([{}, { method: 'cash' }]);

  const runs = [
    ['EP1', () => validCase('EP1', 'alice', 'cash', 0.1)],
    ['EP2', () => validCase('EP2', 'bob', 'credit_card', 0)],
    ['EP3', () => invalidValueCase('EP3', 'carol', () => ({ paymentMethod: invalidString }), JSON.stringify(invalidString))],
    ['EP4', () => invalidValueCase('EP4', 'carol', () => ({ paymentMethod: nonString }), JSON.stringify(nonString))],
    ['EP5', () => invalidValueCase('EP5', 'carol', () => absentBody, `body ${JSON.stringify(absentBody)}`)],
    ['EP7', () => emptyCartCase('alice')], // Alice's cart was emptied by EP1
  ];

  const results = [];
  let n = 1;
  for (const [key, fn] of runs) {
    const tc = `TC-${String(n++).padStart(2, '0')}`;
    try {
      const r = await fn();
      r.pass = r.checks.every((c) => c.pass);
      results.push({ tc, title: titles[key], ...r });
    } catch (e) {
      results.push({ tc, title: titles[key], partitions: [key], pass: false, error: e.message, checks: [], evidence: [] });
    }
    const last = results[results.length - 1];
    console.log(`${last.pass ? 'PASS' : 'FAIL'}  ${tc}  ${last.partitions.join('+')}  ${last.title}  value=${last.value}`);
    last.checks.filter((c) => !c.pass).forEach((c) =>
      console.log(`        ✗ ${c.label}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}`));
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const meta = { seed: SEED, baseUrl: BASE_URL, runAt: new Date().toISOString(), node: process.version };
  fs.writeFileSync(path.join(REPORT_DIR, 'discount-ep-evidence.json'), JSON.stringify({ meta, partitions: PARTITIONS, results }, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, 'discount-ep-report.html'), renderHtml(meta, results));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed  (seed ${SEED})`);
  console.log(`Report:   ${path.join(REPORT_DIR, 'discount-ep-report.html')}`);
  process.exitCode = passed === results.length ? 0 : 1;
})();

// ---------- HTML report ----------
function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const fmt = (v) => (v === undefined ? '<span class="muted">(absent)</span>' : `<code>${esc(JSON.stringify(v))}</code>`);

function renderHtml(meta, results) {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const coverage = PARTITIONS.map((p) => {
    const tcs = results.filter((r) => r.partitions.includes(p.id));
    const status = !tcs.length ? 'none' : tcs.every((r) => r.pass) ? 'pass' : 'fail';
    return { ...p, tcs, status };
  });

  const partitionRows = coverage.map((p) => `
    <tr>
      <td><strong>${p.id}</strong></td>
      <td>${esc(p.input)}</td>
      <td><span class="tag ${p.type === 'Valid' ? 'valid' : 'invalid'}">${p.type}</span></td>
      <td>${esc(p.name)}<div class="muted small">${esc(p.domain)}</div></td>
      <td>${esc(p.expected)}</td>
      <td>${p.tcs.map((t) => `<a href="#${t.tc}">${t.tc}</a>`).join(', ')}</td>
      <td><span class="badge ${p.status}">${p.status === 'pass' ? 'PASS' : p.status === 'fail' ? 'FAIL' : '—'}</span></td>
    </tr>`).join('');

  const summaryRows = results.map((r) => `
    <tr>
      <td><a href="#${r.tc}">${r.tc}</a></td>
      <td>${r.partitions.join(' + ')}</td>
      <td>${esc(r.title)}</td>
      <td><code>${esc(r.value ?? '')}</code></td>
      <td><span class="badge ${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}</span></td>
    </tr>`).join('');

  const cases = results.map((r) => {
    const cartTxt = r.cart && r.cart.length
      ? r.cart.map((i) => { const p = PRODUCTS.find((x) => x.id === i.productId); return `${i.quantity} × ${p.name} (${p.price.toFixed(2)})`; }).join(', ')
      : 'empty';
    const checks = r.checks.map((c) => `
      <tr class="${c.pass ? '' : 'row-fail'}">
        <td>${esc(c.label)}</td><td>${fmt(c.expected)}</td><td>${fmt(c.actual)}</td>
        <td><span class="badge ${c.pass ? 'pass' : 'fail'}">${c.pass ? 'PASS' : 'FAIL'}</span></td>
      </tr>`).join('');
    const ev = r.evidence.map((e, i) => `
      <details class="ev"${e.step.startsWith('Action') ? ' open' : ''}>
        <summary><span class="step">${i + 1}. ${esc(e.step)}</span>
          <span class="http"><code>${e.request.method} ${esc(e.request.url.replace(meta.baseUrl, ''))}</code>
          <span class="status s${String(e.response.status)[0]}">${e.response.status}</span></span></summary>
        <div class="ev-grid">
          <div><div class="label">Request · ${esc(e.timestamp)}</div>
<pre>${esc(`${e.request.method} ${e.request.url}\n${Object.entries(e.request.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${e.request.body === undefined ? '' : JSON.stringify(e.request.body, null, 2)}`)}</pre></div>
          <div><div class="label">Response · ${e.durationMs} ms</div>
<pre>${esc(`HTTP ${e.response.status}\n\n${JSON.stringify(e.response.body, null, 2)}`)}</pre></div>
        </div>
      </details>`).join('');
    return `
    <section class="case" id="${r.tc}">
      <header>
        <h3>${r.tc} · ${esc(r.title)}</h3>
        <span class="badge ${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}</span>
      </header>
      <dl>
        <dt>Partition(s)</dt><dd>${r.partitions.join(' + ')}</dd>
        <dt>Value picked</dt><dd><code>${esc(r.value ?? '')}</code></dd>
        <dt>User</dt><dd>${esc(r.user ? USERS[r.user].email : '')}</dd>
        <dt>Cart</dt><dd>${esc(cartTxt)}</dd>
      </dl>
      ${r.error ? `<p class="error">Error: ${esc(r.error)}</p>` : ''}
      <div class="table-wrap"><table>
        <thead><tr><th>Check</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead>
        <tbody>${checks}</tbody>
      </table></div>
      <h4>Evidence</h4>
      ${ev}
    </section>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Discount EP Report</title>
<style>
:root {
  --bg: #f7f7f5; --surface: #ffffff; --text: #1d1d1b; --muted: #6b6b66; --border: #e3e2dd;
  --pass: #1f7a4d; --pass-bg: #e3f3ea; --fail: #b42318; --fail-bg: #fde8e6;
  --accent: #2f5bd3; --code-bg: #f1f0ec; --valid-bg: #e6edfb; --invalid-bg: #f6ece0; --invalid: #8a4b0f;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #161615; --surface: #1f1f1d; --text: #ecebe6; --muted: #9c9b95; --border: #33332f;
    --pass: #5cc98f; --pass-bg: #173326; --fail: #ff8a7d; --fail-bg: #3a1c19;
    --accent: #8aa8ff; --code-bg: #2a2a27; --valid-bg: #1e2a45; --invalid-bg: #3a2c1a; --invalid: #f0b56e;
  }
}
:root[data-theme="dark"] {
  --bg: #161615; --surface: #1f1f1d; --text: #ecebe6; --muted: #9c9b95; --border: #33332f;
  --pass: #5cc98f; --pass-bg: #173326; --fail: #ff8a7d; --fail-bg: #3a1c19;
  --accent: #8aa8ff; --code-bg: #2a2a27; --valid-bg: #1e2a45; --invalid-bg: #3a2c1a; --invalid: #f0b56e;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 26px; margin: 0 0 4px; } h2 { font-size: 19px; margin: 40px 0 12px; }
h3 { font-size: 16px; margin: 0; } h4 { font-size: 14px; margin: 18px 0 8px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
a { color: var(--accent); }
.muted { color: var(--muted); } .small { font-size: 13px; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }
pre { background: var(--code-bg); padding: 12px; border-radius: 6px; margin: 0; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 20px 0; }
.stat { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
.stat .n { font-size: 26px; font-weight: 600; } .stat .l { color: var(--muted); font-size: 13px; }
.stat.pass .n { color: var(--pass); } .stat.fail .n { color: var(--fail); }
.card, .case { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 18px; }
.case { margin-bottom: 18px; scroll-margin-top: 12px; }
.case header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 600; }
.row-fail td { background: var(--fail-bg); }
.badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: .03em; }
.badge.pass { background: var(--pass-bg); color: var(--pass); } .badge.fail { background: var(--fail-bg); color: var(--fail); }
.badge.none { color: var(--muted); }
.tag { font-size: 12px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
.tag.valid { background: var(--valid-bg); color: var(--accent); } .tag.invalid { background: var(--invalid-bg); color: var(--invalid); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0 0 14px; font-size: 14px; }
dt { color: var(--muted); } dd { margin: 0; }
.ev { border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px; }
.ev summary { cursor: pointer; padding: 8px 12px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 14px; }
.ev-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 12px 12px; }
.label { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.status { font-family: ui-monospace, monospace; font-weight: 700; font-size: 13px; margin-left: 6px; }
.status.s2 { color: var(--pass); } .status.s4, .status.s5 { color: var(--fail); }
.error { color: var(--fail); }
.rule { border-left: 3px solid var(--accent); padding-left: 14px; }
@media (max-width: 720px) { .ev-grid { grid-template-columns: 1fr; } dl { grid-template-columns: 1fr; } dt { margin-top: 6px; } }
</style>
</head>
<body>
<main>
  <h1>Checkout discount rule · Equivalence Partitioning</h1>
  <p class="muted">Run ${esc(meta.runAt)} · ${esc(meta.baseUrl)} · Node ${esc(meta.node)} · RNG seed <code>${meta.seed}</code> (rerun with <code>node tests/discount-ep.js ${meta.seed}</code>)</p>

  <div class="stats">
    <div class="stat"><div class="n">${PARTITIONS.length}</div><div class="l">Partitions identified</div></div>
    <div class="stat"><div class="n">${results.length}</div><div class="l">Test cases executed</div></div>
    <div class="stat pass"><div class="n">${passed}</div><div class="l">Passed</div></div>
    <div class="stat fail"><div class="n">${failed}</div><div class="l">Failed</div></div>
  </div>

  <h2>Rule under test</h2>
  <div class="card rule">
    <p><strong>README business rules 1–3 / swagger <code>POST /checkout</code>:</strong></p>
    <ul>
      <li><code>cash</code> → 10% discount on the cart subtotal</li>
      <li><code>credit_card</code> → no discount</li>
      <li><code>paymentMethod</code> must be exactly <code>cash</code> or <code>credit_card</code>; anything else returns <code>400</code> (swagger: <code>enum: [cash, credit_card]</code>, required)</li>
    </ul>
    <p class="muted small">Technique: Equivalence Partitioning only. Inputs are <code>paymentMethod</code> and the cart subtotal the discount applies to. One value is drawn at random from inside each partition; cart contents are also random, built from the README products (Wireless Mouse 25.00, Mechanical Keyboard 80.00, USB-C Monitor 200.00) and users (alice, bob, carol). Expected values are computed from the rule, not read back from the API.</p>
  </div>

  <h2>Partitions</h2>
  <div class="card table-wrap"><table>
    <thead><tr><th>ID</th><th>Input</th><th>Class</th><th>Partition</th><th>Expected behaviour</th><th>Tests</th><th>Result</th></tr></thead>
    <tbody>${partitionRows}</tbody>
  </table></div>

  <h2>Test summary</h2>
  <div class="card table-wrap"><table>
    <thead><tr><th>Test</th><th>Partition(s)</th><th>Title</th><th>Random value</th><th>Result</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table></div>

  <h2>Test cases and evidence</h2>
  ${cases}
</main>
</body>
</html>`;
}
