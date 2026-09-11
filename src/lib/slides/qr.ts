import QRCode from 'qrcode';

/**
 * A QR code as SVG path data, generated locally so the value never leaves
 * the page: round dot modules and rounded finder "eyes", the look Yes Smile's
 * aftercare slide had. Two paths rather than markup so the slide draws it
 * with `<path d>` and never `{@html}`.
 */
export type QrDrawing = {
	/** Modules across, quiet zone included — the SVG's viewBox is `0 0 dim dim`. */
	dim: number;
	/** Every data module, as one circle path each. */
	dots: string;
	/** The three finder eyes; drawn with `fill-rule="evenodd"` so the rings are hollow. */
	eyes: string;
};

const MARGIN = 2;
const RADIUS = 0.45;

/** Path for a rounded rectangle, usable inside an evenodd compound path. */
function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
	const rr = Math.min(r, w / 2, h / 2);
	return (
		`M${String(x + rr)},${String(y)}` +
		`h${String(w - 2 * rr)}a${String(rr)},${String(rr)} 0 0 1 ${String(rr)},${String(rr)}` +
		`v${String(h - 2 * rr)}a${String(rr)},${String(rr)} 0 0 1 ${String(-rr)},${String(rr)}` +
		`h${String(-(w - 2 * rr))}a${String(rr)},${String(rr)} 0 0 1 ${String(-rr)},${String(-rr)}` +
		`v${String(-(h - 2 * rr))}a${String(rr)},${String(rr)} 0 0 1 ${String(rr)},${String(-rr)}z`
	);
}

function circle(cx: number, cy: number): string {
	const d = RADIUS * 2;
	return (
		`M${String(cx - RADIUS)},${String(cy)}` +
		`a${String(RADIUS)},${String(RADIUS)} 0 1 0 ${String(d)},0` +
		`a${String(RADIUS)},${String(RADIUS)} 0 1 0 ${String(-d)},0`
	);
}

/** The drawing for a value, or null for a blank or an overlong one — the slide then omits it. */
export function qrDrawing(value: string): QrDrawing | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	let modules;
	try {
		modules = QRCode.create(trimmed, { errorCorrectionLevel: 'M' }).modules;
	} catch {
		return null;
	}
	const count = modules.size;
	const dim = count + MARGIN * 2;
	// The three 7×7 finder eyes are drawn as rings, so their modules are skipped here.
	const inFinder = (r: number, c: number) =>
		(r < 7 && c < 7) || (r < 7 && c >= count - 7) || (r >= count - 7 && c < 7);

	let dots = '';
	for (let r = 0; r < count; r++) {
		for (let c = 0; c < count; c++) {
			if (modules.get(r, c) !== 1 || inFinder(r, c)) continue;
			dots += circle(c + MARGIN + 0.5, r + MARGIN + 0.5);
		}
	}
	const eye = (row: number, col: number): string => {
		const x = col + MARGIN;
		const y = row + MARGIN;
		// Outer ring (7×7 minus the 5×5 hole), then the 3×3 centre.
		return (
			roundedRect(x, y, 7, 7, 2) +
			roundedRect(x + 1, y + 1, 5, 5, 1.4) +
			roundedRect(x + 2, y + 2, 3, 3, 1)
		);
	};
	return { dim, dots, eyes: eye(0, 0) + eye(0, count - 7) + eye(count - 7, 0) };
}
