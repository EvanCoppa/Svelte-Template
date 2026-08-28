import { describe, expect, it } from 'vitest';
import {
	button,
	emailLayout,
	escapeHtml,
	notificationEmail,
	paragraph,
	welcomeEmail
} from './email-templates';

describe('escapeHtml', () => {
	it('escapes every HTML-significant character', () => {
		expect(escapeHtml(`<img src=x onerror="alert('&')">`)).toBe(
			'&lt;img src=x onerror=&quot;alert(&#39;&amp;&#39;)&quot;&gt;'
		);
	});

	it('escapes & first so entities are not double-broken', () => {
		expect(escapeHtml('&lt;')).toBe('&amp;lt;');
	});
});

describe('emailLayout', () => {
	it('wraps the heading and body in a full HTML document', () => {
		const html = emailLayout({ heading: 'Hello', bodyHtml: paragraph('Body') });
		expect(html).toContain('<!doctype html>');
		expect(html).toContain('Hello');
		expect(html).toContain('Body');
		expect(html).not.toContain('footerText');
	});

	it('renders the footer only when given', () => {
		expect(emailLayout({ heading: 'H', bodyHtml: '', footerText: 'Bye' })).toContain('Bye');
	});
});

describe('button', () => {
	it('escapes the href and label', () => {
		const html = button('https://app.test/?a=1&b=2', '<Open>');
		expect(html).toContain('href="https://app.test/?a=1&amp;b=2"');
		expect(html).toContain('&lt;Open&gt;');
	});
});

describe('welcomeEmail', () => {
	it('produces subject, html and hand-written text', () => {
		const email = welcomeEmail({
			name: 'Evan',
			appName: 'Acme',
			appUrl: 'https://app.test'
		});
		expect(email.subject).toBe('Welcome to Acme');
		expect(email.html).toContain('Welcome, Evan!');
		expect(email.html).toContain('https://app.test');
		expect(email.text).toContain('https://app.test');
	});

	it('escapes user data in the html but not the text version', () => {
		const email = welcomeEmail({
			name: '<b>Evan & Co</b>',
			appName: 'Acme',
			appUrl: 'https://app.test'
		});
		expect(email.html).toContain('&lt;b&gt;Evan &amp; Co&lt;/b&gt;');
		expect(email.html).not.toContain('<b>Evan');
		expect(email.text).toContain('<b>Evan & Co</b>');
	});
});

describe('notificationEmail', () => {
	it('escapes the heading and message in the html', () => {
		const email = notificationEmail({
			subject: 'Alert',
			heading: 'Disk <full>',
			message: 'Usage > 90%'
		});
		expect(email.html).toContain('Disk &lt;full&gt;');
		expect(email.html).toContain('Usage &gt; 90%');
		expect(email.text).toBe('Disk <full>\n\nUsage > 90%');
	});

	it('renders the call-to-action only when given', () => {
		const without = notificationEmail({ subject: 's', heading: 'h', message: 'm' });
		expect(without.html).not.toContain('<a ');

		const withCta = notificationEmail({
			subject: 's',
			heading: 'h',
			message: 'm',
			cta: { label: 'View', url: 'https://app.test/x' }
		});
		expect(withCta.html).toContain('https://app.test/x');
		expect(withCta.text).toContain('View: https://app.test/x');
	});
});
