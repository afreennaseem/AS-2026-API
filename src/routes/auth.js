const express = require('express');
const jwt = require('jsonwebtoken');
const { users } = require('../database');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const publicUser = ({ password, ...rest }) => rest;

router.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (users.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(409).json({ error: 'Email is already registered' });
  }
  const user = { id: users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1, name, email, password };
  users.push(user);
  return res.status(201).json(publicUser(user));
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
  return res.status(200).json({ token, user: publicUser(user) });
});

module.exports = router;
