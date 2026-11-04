// Thin wrapper around SuperTest: builds the request, sends it and records evidence.
const supertest = require('supertest');
const { BASE_URL, API_PREFIX } = require('./config');
const evidence = require('./evidence');

const request = supertest(BASE_URL);

async function send(step, method, path, { token, body } = {}) {
  const url = API_PREFIX + path;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let req = request[method.toLowerCase()](url).set(headers);
  if (body !== undefined) req = req.send(body);
  const res = await req;

  evidence.record(step, { method, url: BASE_URL + url, headers, body }, res);
  return res;
}

module.exports = { send };
