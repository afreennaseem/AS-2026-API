const { expect } = require('chai');
const { send } = require('./api');
const { secret } = require('./config');
const users = require('../data/users.json');

function credentials(userKey) {
  const user = users[userKey];
  if (!user) throw new Error(`Unknown test user "${userKey}" (see test/data/users.json)`);
  return { email: user.email, password: secret(user.passwordEnv) };
}

// Logs in a README test user and returns the JWT token.
async function login(userKey) {
  const creds = credentials(userKey);
  const res = await send(`Setup: login as ${creds.email}`, 'POST', '/login', { body: creds });
  expect(res.status, `login as ${creds.email}`).to.equal(200);
  expect(res.body).to.have.property('token').that.is.a('string');
  return res.body.token;
}

module.exports = { login, credentials };
