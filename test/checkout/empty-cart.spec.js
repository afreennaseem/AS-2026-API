// Equivalence partition EP7 (subtotal = 0, empty cart).
const { expect } = require('chai');
const { login } = require('../helpers/auth');
const { getCart } = require('../helpers/cart');
const { checkout } = require('../helpers/checkout');
const cases = require('../data/checkout/empty-cart.json');

describe('Checkout - empty cart (no discount computed)', () => {
  cases.forEach((tc) => {
    describe(`[${tc.partition}] ${tc.title}`, () => {
      let token;
      let res;

      before(async () => {
        token = await login(tc.user);
        const cart = await getCart(token, 'Setup: confirm cart is empty');
        expect(cart.body.items, 'precondition: cart must be empty').to.have.lengthOf(0);
        res = await checkout(token, { paymentMethod: tc.paymentMethod });
      });

      it(`returns HTTP ${tc.expected.status}`, () => {
        expect(res.status).to.equal(tc.expected.status);
      });

      it(`returns error "${tc.expected.error}"`, () => {
        expect(res.body.error).to.equal(tc.expected.error);
      });

      it('does not return a discount or an order', () => {
        expect(res.body).to.not.have.any.keys('discount', 'total', 'orderId');
      });
    });
  });
});
