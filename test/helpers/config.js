// Loads .env once and exposes typed configuration for the test suite.
require('dotenv').config({ quiet: true });

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.`);
  return value;
};

module.exports = {
  BASE_URL: required('BASE_URL'),
  API_PREFIX: process.env.API_PREFIX || '/api',
  START_SERVER: process.env.START_SERVER === 'true',
  secret: required,
};
