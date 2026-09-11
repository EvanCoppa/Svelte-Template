import { describe, expect, it } from 'vitest';
import { qrDrawing } from './qr';

describe('qrDrawing', () => {
	it('draws nothing for a blank value', () => {
		expect(qrDrawing('')).toBeNull();
		expect(qrDrawing('   ')).toBeNull();
	});

	it('draws a quiet zone, dots and three eyes for a URL', () => {
		const drawing = qrDrawing('https://example.com/book');
		if (!drawing) throw new Error('expected a drawing');
		// Version 1 is 21 modules; a short URL needs a few more, plus 2 of margin a side.
		expect(drawing.dim).toBeGreaterThanOrEqual(25);
		expect(drawing.dots.startsWith('M')).toBe(true);
		expect(drawing.eyes.match(/z/g)).toHaveLength(9);
	});

	it('gives up on a value too long to encode', () => {
		expect(qrDrawing('x'.repeat(10000))).toBeNull();
	});
});
