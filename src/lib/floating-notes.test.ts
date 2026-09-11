import { describe, expect, it } from 'vitest';
import {
	KEEP_ON_SCREEN,
	clampPlacement,
	floatingNotes,
	placeNote,
	type FloatingNote
} from './floating-notes.svelte';

const size = { width: 320, height: 288 };
const viewport = { width: 1280, height: 800 };

describe('clampPlacement', () => {
	it('leaves a note that is on screen where it was dropped', () => {
		expect(clampPlacement({ x: 400, y: 120 }, size, viewport)).toEqual({ x: 400, y: 120 });
	});

	it('keeps a grabbable strip of the note inside either side', () => {
		expect(clampPlacement({ x: -1000, y: 120 }, size, viewport).x).toBe(
			KEEP_ON_SCREEN - size.width
		);
		expect(clampPlacement({ x: 5000, y: 120 }, size, viewport).x).toBe(
			viewport.width - KEEP_ON_SCREEN
		);
	});

	it('never lets the top edge, where the close button is, leave the screen', () => {
		expect(clampPlacement({ x: 400, y: -50 }, size, viewport).y).toBe(0);
		expect(clampPlacement({ x: 400, y: 5000 }, size, viewport).y).toBe(
			viewport.height - KEEP_ON_SCREEN
		);
	});
});

describe('placeNote', () => {
	const desk: FloatingNote[] = [
		{ id: 'a', x: 10, y: 10 },
		{ id: 'b', x: 20, y: 20 }
	];

	it('adds a note on top of the desk', () => {
		expect(placeNote(desk, { id: 'c', x: 30, y: 30 }).map((n) => n.id)).toEqual(['a', 'b', 'c']);
	});

	it('moves a note that already floats, bringing it to the top', () => {
		const moved = placeNote(desk, { id: 'a', x: 99, y: 99 });
		expect(moved).toEqual([
			{ id: 'b', x: 20, y: 20 },
			{ id: 'a', x: 99, y: 99 }
		]);
	});
});

describe('floatingNotes', () => {
	it('keeps one desk per user and organization', () => {
		floatingNotes.place('u1:org1', { id: 'a', x: 1, y: 2 });
		expect(floatingNotes.floatingIn('u1:org1')).toEqual([{ id: 'a', x: 1, y: 2 }]);
		// Another org's session starts with a clear desk, not this one's notes.
		expect(floatingNotes.floatingIn('u1:org2')).toEqual([]);
	});

	it('docks a note back, and ignores one that was not floating', () => {
		floatingNotes.place('u2:org1', { id: 'a', x: 1, y: 2 });
		floatingNotes.place('u2:org1', { id: 'b', x: 3, y: 4 });
		floatingNotes.dock('u2:org1', 'a');
		floatingNotes.dock('u2:org1', 'never-floated');
		expect(floatingNotes.floatingIn('u2:org1')).toEqual([{ id: 'b', x: 3, y: 4 }]);
	});
});
