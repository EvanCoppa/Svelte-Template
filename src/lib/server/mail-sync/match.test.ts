import { describe, expect, it } from 'vitest';
import {
	companyDomains,
	domainOf,
	isExcluded,
	matchMessage,
	normalizeAddress,
	type MatchIndex
} from './match';

const index: MatchIndex = {
	contactsByEmail: new Map([
		['lucius@wayne.example.com', { id: 'contact-lucius', companyId: 'company-wayne' }],
		['bruce@gmail.com', { id: 'contact-bruce', companyId: null }]
	]),
	companiesByDomain: new Map([
		['wayne.example.com', 'company-wayne'],
		['stark.example.com', 'company-stark']
	]),
	memberAddresses: new Set(['dev@example.com', 'evan@example.com'])
};

describe('normalizeAddress / domainOf', () => {
	it('lower-cases and trims', () => {
		expect(normalizeAddress('  Lucius@Wayne.Example.COM ')).toBe('lucius@wayne.example.com');
	});

	it('reads the domain, or nothing for a non-address', () => {
		expect(domainOf('a@b.example')).toBe('b.example');
		expect(domainOf('not-an-address')).toBeNull();
		expect(domainOf('@nothing')).toBeNull();
		expect(domainOf('dangling@')).toBeNull();
	});
});

describe('isExcluded', () => {
	it('matches a whole address exactly', () => {
		expect(isExcluded('Boss@Example.com', ['boss@example.com'])).toBe(true);
		expect(isExcluded('boss2@example.com', ['boss@example.com'])).toBe(false);
	});

	it('matches a domain pattern and its subdomains', () => {
		expect(isExcluded('anyone@example.com', ['@example.com'])).toBe(true);
		expect(isExcluded('anyone@mail.example.com', ['@example.com'])).toBe(true);
		expect(isExcluded('anyone@notexample.com', ['@example.com'])).toBe(false);
	});

	it('is false with no patterns', () => {
		expect(isExcluded('anyone@example.com', [])).toBe(false);
	});
});

describe('companyDomains', () => {
	it('reads the website host and the email domain, once each', () => {
		expect(
			companyDomains({
				website: 'https://www.wayne.example.com/about',
				email: 'hi@wayne.example.com'
			})
		).toEqual(['wayne.example.com']);
	});

	it('accepts a bare host as a website', () => {
		expect(companyDomains({ website: 'stark.example.com', email: null })).toEqual([
			'stark.example.com'
		]);
	});

	it('never claims a free-mail domain', () => {
		expect(companyDomains({ website: null, email: 'shop@gmail.com' })).toEqual([]);
	});

	it('ignores a website that is not a URL', () => {
		expect(companyDomains({ website: 'not a url at all', email: null })).toEqual([]);
	});
});

describe('matchMessage', () => {
	it('files a contact’s message on the contact and their company', () => {
		const outcome = matchMessage(['Lucius@wayne.example.com', 'dev@example.com'], index);
		expect(outcome.links).toEqual([
			{ entityType: 'contact', entityId: 'contact-lucius', source: 'participant' },
			{ entityType: 'company', entityId: 'company-wayne', source: 'participant' }
		]);
		expect(outcome.contactsByAddress.get('lucius@wayne.example.com')).toBe('contact-lucius');
		expect(outcome.internalOnly).toBe(false);
	});

	it('files an unknown address at a known domain on the company', () => {
		const outcome = matchMessage(['dev@example.com', 'someone.new@stark.example.com'], index);
		expect(outcome.links).toEqual([
			{ entityType: 'company', entityId: 'company-stark', source: 'domain' }
		]);
		expect(outcome.contactsByAddress.size).toBe(0);
	});

	it('never files a free-mail correspondent by domain', () => {
		const outcome = matchMessage(['stranger@gmail.com', 'dev@example.com'], index);
		expect(outcome.links).toEqual([]);
	});

	it('still files a contact who happens to use free mail', () => {
		const outcome = matchMessage(['bruce@gmail.com'], index);
		expect(outcome.links).toEqual([
			{ entityType: 'contact', entityId: 'contact-bruce', source: 'participant' }
		]);
	});

	it('lists each record once however many addresses point at it', () => {
		const outcome = matchMessage(
			['lucius@wayne.example.com', 'other@wayne.example.com', 'lucius@wayne.example.com'],
			index
		);
		expect(outcome.links).toHaveLength(2);
	});

	it('flags a thread between members alone as internal', () => {
		const outcome = matchMessage(['dev@example.com', 'Evan@example.com'], index);
		expect(outcome.internalOnly).toBe(true);
		expect(outcome.links).toEqual([]);
	});

	it('is not internal once anyone external is on it', () => {
		expect(matchMessage(['dev@example.com', 'x@y.example'], index).internalOnly).toBe(false);
	});
});
