// Equivalence partitions EP1 (cash), EP2 (credit_card) and EP6 (subtotal > 0).
const { expect } = require('chai');
const { login } = require('../helpers/auth');
const { fillCart } = require('../helpers/cart');
const { checkout } = require('../helpers/checkout');
const { subtotalOf, discountOf, round } = require('../helpers/pricing');
const cases = require('../data/checkout/valid-payment-methods.json');

describe('Checkout - valid payment methods (discount applied)', () => {
  cases.forEach((tc) => {
    describe(`[${tc.partition}] ${tc.title}`, () => {
      let res;

      before(async () => {
        const token = await login(tc.user);
        await fillCart(token, tc.cart);
        res = await checkout(token, { paymentMethod: tc.paymentMethod });
      });

      it('test data is consistent with the README rule', () => {
        const subtotal = subtotalOf(tc.cart);
        expect(subtotal).to.equal(tc.expected.subtotal);
        expect(discountOf(subtotal, tc.expected.discountRate)).to.equal(tc.expected.discount);
      });

      it(`returns HTTP ${tc.expected.status}`, () => {
        expect(res.status).to.equal(tc.expected.status);
      });

      it(`echoes paymentMethod "${tc.paymentMethod}"`, () => {
        expect(res.body.paymentMethod).to.equal(tc.paymentMethod);
      });

      it(`returns subtotal ${tc.expected.subtotal}`, () => {
        expect(res.body.subtotal).to.equal(tc.expected.subtotal);
      });

      it(`returns discount ${tc.expected.discount} (${tc.expected.discountRate * 100}% of subtotal)`, () => {
        expect(res.body.discount).to.equal(tc.expected.discount);
      });

      it(`returns total ${tc.expected.total} (subtotal - discount)`, () => {
        expect(res.body.total).to.equal(tc.expected.total);
        expect(res.body.total).to.equal(round(res.body.subtotal - res.body.discount));
      });
    });
  });
});
