import { describe, expect, it } from 'vitest';
import { couponDiscountText } from './coupons';

describe('couponDiscountText', () => {
	it('reads a percentage as a percentage, without trailing zeros', () => {
		expect(
			couponDiscountText({ discount_type: 'percent', discount_value: 20, currency: 'USD' })
		).toBe('20%');
		expect(
			couponDiscountText({ discount_type: 'percent', discount_value: 12.5, currency: 'USD' })
		).toBe('12.5%');
	});

	it('reads a sum in the coupon’s own currency', () => {
		expect(
			couponDiscountText({ discount_type: 'amount', discount_value: 15, currency: 'USD' })
		).toBe('$15.00');
		// The currency is the coupon's, not the app's — a euro coupon prints in euros.
		expect(
			couponDiscountText({ discount_type: 'amount', discount_value: 15, currency: 'EUR' })
		).toContain('15.00');
	});

	it('says nothing off rather than going blank', () => {
		expect(
			couponDiscountText({ discount_type: 'percent', discount_value: 0, currency: 'USD' })
		).toBe('0%');
	});
});
