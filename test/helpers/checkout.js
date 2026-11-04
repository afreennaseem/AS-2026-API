const { send } = require('./api');

const checkout = (token, body) => send('Action: checkout', 'POST', '/checkout', { token, body });

module.exports = { checkout };
