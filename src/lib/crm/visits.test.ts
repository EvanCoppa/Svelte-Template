import { describe, expect, it } from 'vitest';
import {
	formatFix,
	isVisitSubjectKind,
	parseFix,
	splitVisitSubject,
	visitName,
	visitSubjectKey,
	VISIT_SUBJECT_KINDS
} from './visits';

const COMPANY_ID = '20000000-0000-0000-0000-000000000001';

describe('visit subjects', () => {
	it('accepts exactly the kinds you can go and see', () => {
		expect([...VISIT_SUBJECT_KINDS]).toEqual(['company', 'contact', 'deal', 'property', 'asset']);
		expect(isVisitSubjectKind('company')).toBe(true);
		expect(isVisitSubjectKind('asset')).toBe(true);
		// An invoice is not somewhere you go, and a visit is never about a
		// visit — the database's `visits_subject_is_visitable` says the same.
		expect(isVisitSubjectKind('invoice')).toBe(false);
		expect(isVisitSubjectKind('visit')).toBe(false);
	});

	it('round-trips a subject through the one string a form field can hold', () => {
		const key = visitSubjectKey('company', COMPANY_ID);
		expect(key).toBe(`company:${COMPANY_ID}`);
		expect(splitVisitSubject(key)).toEqual(['company', COMPANY_ID]);
	});

	it('refuses a subject it cannot split rather than guessing a kind', () => {
		// Guessing would write the entity link at the wrong table, and the
		// database would accept it.
		expect(() => splitVisitSubject('invoice:' + COMPANY_ID)).toThrow(/does not name a record/);
		expect(() => splitVisitSubject(COMPANY_ID)).toThrow();
		expect(() => splitVisitSubject('company:')).toThrow();
	});
});

describe('visitName', () => {
	it('is the subject’s name', () => {
		expect(visitName('Acme Dental')).toBe('Acme Dental');
		expect(visitName('  Acme Dental  ')).toBe('Acme Dental');
	});

	it('falls back when the reader cannot see the subject', () => {
		// Never because the visit is about nobody: the column pair is not
		// nullable.
		expect(visitName(null)).toBe('Visit');
		expect(visitName(undefined)).toBe('Visit');
		expect(visitName('   ')).toBe('Visit');
	});
});

describe('a fix as one form field', () => {
	it('round-trips a point with and without its radius', () => {
		const withRadius = { latitude: 51.5, longitude: -0.12, accuracy: 12.5 };
		expect(formatFix(withRadius)).toBe('51.5,-0.12,12.5');
		expect(parseFix(formatFix(withRadius))).toEqual(withRadius);

		const bare = { latitude: 51.5, longitude: -0.12, accuracy: null };
		expect(formatFix(bare)).toBe('51.5,-0.12');
		expect(parseFix(formatFix(bare))).toEqual(bare);
	});

	it('reads no location as no location', () => {
		expect(formatFix(null)).toBe('');
		expect(parseFix('')).toBeNull();
		expect(parseFix(null)).toBeNull();
		expect(parseFix(undefined)).toBeNull();
	});

	it('refuses a fix it cannot trust, rather than storing a wrong one', () => {
		// The action can be POSTed directly, so nothing unparseable or out of
		// range reaches a column — a visit is worth keeping without a fix.
		expect(parseFix('51.5')).toBeNull();
		expect(parseFix('91,0')).toBeNull();
		expect(parseFix('0,181')).toBeNull();
		expect(parseFix('north,west')).toBeNull();
		expect(parseFix('51.5,-0.12,10,extra')).toBeNull();
		expect(parseFix('51.5,')).toBeNull();
	});

	it('keeps the point when only the radius is nonsense', () => {
		// How sure the device was is a separate claim from where it was.
		expect(parseFix('51.5,-0.12,-3')).toEqual({ latitude: 51.5, longitude: -0.12, accuracy: null });
		expect(parseFix('51.5,-0.12,wide')).toEqual({
			latitude: 51.5,
			longitude: -0.12,
			accuracy: null
		});
	});
});
