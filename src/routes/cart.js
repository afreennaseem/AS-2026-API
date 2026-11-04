const express = require('express');
const { products, carts } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const round = (n) => Math.round(n * 100) / 100;

function buildCartView(userId) {
  const items = (carts[userId] || []).map(({ productId, quantity }) => {
    const product = products.find((p) => p.id === productId);
    return {
      productId,
      name: product.name,
      price: product.price,
      quantity,
      subtotal: round(product.price * quantity),
    };
  });
  const total = round(items.reduce((sum, i) => sum + i.subtotal, 0));
  return { items, total };
}

router.get('/', authenticate, (req, res) => {
  res.status(200).json(buildCartView(req.user.id));
});

router.post('/', authenticate, (req, res) => {
  const { productId, quantity } = req.body || {};
  if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'productId and quantity must be positive integers' });
  }
  const product = products.find((p) => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: `Product ${productId} not found` });
  }
  const cart = (carts[req.user.id] = carts[req.user.id] || []);
  const existing = cart.find((i) => i.productId === productId);
  const newQuantity = (existing ? existing.quantity : 0) + quantity;
  if (newQuantity > product.stock) {
    return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${product.stock}` });
  }
  if (existing) existing.quantity = newQuantity;
  else cart.push({ productId, quantity });
  return res.status(200).json(buildCartView(req.user.id));
});

module.exports = { router, buildCartView, round };
