module.exports = {
  spec: ['test/**/*.spec.js'],
  require: ['test/setup/hooks.js'],
  timeout: 10000,
  reporter: 'mochawesome',
  'reporter-option': [
    'reportDir=reports/mochawesome',
    'reportFilename=checkout-api-report',
    'reportTitle=Checkout API - Discount rule (Equivalence Partitioning)',
    'reportPageTitle=Checkout API Tests',
    'charts=true',
    'code=true',
    'json=true',
  ],
};
