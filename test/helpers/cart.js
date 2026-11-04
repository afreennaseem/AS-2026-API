const { expect } = require('chai');
const { send } = require('./api');

const getCart = (token, step = 'Get cart') => send(step, 'GET', '/cart', { token });

async function addToCart(token, { productId, quantity }) {
  const res = await send(`Setup: add product ${productId} x${quantity}`, 'POST', '/cart', {
    token,
    body: { productId, quantity },
  });
  expect(res.status, `add product ${productId} to cart`).to.equal(200);
  return res;
}

// Adds every item to the cart and returns the resulting cart body.
async function fillCart(token, items) {
  let res;
  for (const item of items) res = await addToCart(token, item);
  return res.body;
}

module.exports = { getCart, addToCart, fillCart };
