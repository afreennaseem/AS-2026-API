// In-memory database: all data lives in these variables and is reset on every restart.

const users = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', password: 'alice123' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', password: 'bob123' },
  { id: 3, name: 'Carol White', email: 'carol@example.com', password: 'carol123' },
];

const products = [
  { id: 1, name: 'Wireless Mouse', price: 25.0, stock: 50 },
  { id: 2, name: 'Mechanical Keyboard', price: 80.0, stock: 30 },
  { id: 3, name: 'USB-C Monitor', price: 200.0, stock: 10 },
];

// carts[userId] = [{ productId, quantity }]
const carts = {};

const orders = [];

module.exports = { users, products, carts, orders };
