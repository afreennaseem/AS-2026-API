// Loaded by .mocharc.js before any spec.
const addContext = require('mochawesome/addContext');
const { BASE_URL, START_SERVER } = require('../helpers/config');
const evidence = require('../helpers/evidence');

let server;

// Global fixtures: optionally start the API in-process so every run uses fresh seed data.
exports.mochaGlobalSetup = async function () {
  if (!START_SERVER) return;
  const app = require('../../src/app');
  const port = Number(new URL(BASE_URL).port) || 80;
  await new Promise((resolve, reject) => {
    server = app.listen(port, resolve).on('error', reject);
  });
};

exports.mochaGlobalTeardown = async function () {
  if (server) await new Promise((resolve) => server.close(resolve));
};

// Root hooks: attach the HTTP evidence of each test to the mochawesome report.
exports.mochaHooks = {
  afterEach() {
    for (const e of evidence.flush()) {
      addContext(this, {
        title: `${e.step} — ${e.request.method} ${e.request.url} → ${e.response.status}`,
        value: { request: e.request, response: e.response, timestamp: e.timestamp },
      });
    }
  },
};
