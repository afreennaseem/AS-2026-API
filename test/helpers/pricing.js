// Computes expected amounts from the README rule and product data,
// independently of the API, to cross-check the data files.
const products = require('../data/products.json');

const round = (n) => Math.round(n * 100) / 100;

const subtotalOf = (items) =>
  round(items.reduce((sum, { productId, quantity }) =>
    sum + products.find((p) => p.id === productId).price * quantity, 0));

const discountOf = (subtotal, rate) => round(subtotal * rate);

module.exports = { round, subtotalOf, discountOf };
