// Equivalence partitions EP3 (unknown string), EP4 (non-string) and EP5 (field absent).
const { expect } = require('chai');
const { login } = require('../helpers/auth');
const { fillCart, getCart } = require('../helpers/cart');
const { checkout } = require('../helpers/checkout');
const data = require('../data/checkout/invalid-payment-methods.json');

describe('Checkout - invalid payment methods (rejected, no discount)', () => {
  let token;
  let cartBefore;

  before(async () => {
    token = await login(data.user);
    // A non-empty cart guarantees that only paymentMethod can cause the 400.
    cartBefore = await fillCart(token, data.cart);
  });

  data.cases.forEach((tc) => {
    describe(`[${tc.partition}] ${tc.title} — body ${JSON.stringify(tc.body)}`, () => {
      let res;

      before(async () => {
        res = await checkout(token, tc.body);
      });

      it(`returns HTTP ${data.expected.status}`, () => {
        expect(res.status).to.equal(data.expected.status);
      });

      it('returns the validation error message', () => {
        expect(res.body.error).to.equal(data.expected.error);
      });

      it('does not return a discount or an order', () => {
        expect(res.body).to.not.have.any.keys('discount', 'total', 'orderId');
      });

      it('leaves the cart unchanged', async () => {
        const after = await getCart(token, 'Verify: cart unchanged');
        expect(after.body).to.deep.equal(cartBefore);
      });
    });
  });
});
