const express = require('express');
const { products, carts, orders } = require('../database');
const { authenticate } = require('../middleware/auth');
const { buildCartView, round } = require('./cart');

const router = express.Router();

// Business rule: cash payments get 10% off, credit card payments get no discount.
const DISCOUNT_RATES = { cash: 0.1, credit_card: 0 };

router.post('/', authenticate, (req, res) => {
  const { paymentMethod } = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(DISCOUNT_RATES, paymentMethod)) {
    return res.status(400).json({ error: "paymentMethod must be 'cash' or 'credit_card'" });
  }

  const cart = buildCartView(req.user.id);
  if (cart.items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  for (const item of cart.items) {
    const product = products.find((p) => p.id === item.productId);
    if (item.quantity > product.stock) {
      return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${product.stock}` });
    }
  }

  const discount = round(cart.total * DISCOUNT_RATES[paymentMethod]);
  const order = {
    orderId: orders.length + 1,
    userId: req.user.id,
    items: cart.items,
    subtotal: cart.total,
    paymentMethod,
    discount,
    total: round(cart.total - discount),
    createdAt: new Date().toISOString(),
  };

  cart.items.forEach((item) => {
    products.find((p) => p.id === item.productId).stock -= item.quantity;
  });
  orders.push(order);
  carts[req.user.id] = [];

  return res.status(201).json(order);
});

module.exports = router;
