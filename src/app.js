const path = require('path');
const fs = require('fs');
const express = require('express');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');

const authRoutes = require('./routes/auth');
const { router: cartRoutes } = require('./routes/cart');
const checkoutRoutes = require('./routes/checkout');

const app = express();
app.use(express.json());

const swaggerPath = path.join(__dirname, '..', 'docs', 'swagger.yaml');
const swaggerDocument = yaml.load(fs.readFileSync(swaggerPath, 'utf8'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/swagger.yaml', (req, res) => res.type('text/yaml').sendFile(swaggerPath));

app.use('/api', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
