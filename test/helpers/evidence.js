// Collects every HTTP exchange made during a test so it can be attached to the
// mochawesome report (see test/setup/hooks.js).
let entries = [];

const maskToken = (headers) => {
  const out = { ...headers };
  if (out.Authorization) out.Authorization = `${out.Authorization.slice(0, 23)}…`;
  return out;
};

function record(step, { method, url, headers, body }, res) {
  entries.push({
    step,
    request: { method, url, headers: maskToken(headers), body },
    response: { status: res.status, body: res.body },
    timestamp: new Date().toISOString(),
  });
}

function flush() {
  const out = entries;
  entries = [];
  return out;
}

module.exports = { record, flush };
