/**
 * Email templates.
 *
 * Every email this app sends is a plain function here returning an
 * `EmailTemplate` (`{ subject, html, text }`), spread straight into
 * `sendEmail()` from `email.ts`:
 *
 *     await sendEmail({ to: user.email, ...welcomeEmail({ name, appUrl: url.origin }) });
 *
 * Adding an email = adding one function here, built on `emailLayout()`. House
 * rules for templates:
 *
 * - Route EVERY interpolated value through `escapeHtml()` in the HTML version
 *   (subjects and `text` are plain text — never escape those).
 * - Always write the `text` version by hand; don't rely on auto-derivation.
 * - Styles stay inline on elements — email clients largely ignore
 *   stylesheets — and layout stays on `emailLayout()` so all mail matches.
 * - No user-controlled URLs in links; build hrefs from your own origin.
 */

export interface EmailTemplate {
	subject: string;
	html: string;
	text: string;
}

/** Escape a value for interpolation into template HTML. */
export function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

const FONT_STACK =
	"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * The shared shell every email renders inside: centered 560px column, plain
 * white card, muted footer. `heading`, `bodyHtml` and `footerText` are trusted
 * template-authored HTML/text — escape any user data before it goes in.
 */
export function emailLayout({
	heading,
	bodyHtml,
	footerText
}: {
	heading: string;
	/** Pre-escaped HTML paragraphs/buttons, e.g. from `paragraph()`/`button()`. */
	bodyHtml: string;
	footerText?: string;
}): string {
	return `<!doctype html>
<html lang="en">
<body style="margin: 0; padding: 32px 16px; background-color: #f5f5f4; font-family: ${FONT_STACK};">
	<div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e7e5e4; border-radius: 8px; padding: 32px;">
		<h1 style="margin: 0 0 16px; font-size: 20px; line-height: 1.3; color: #1c1917;">${heading}</h1>
		${bodyHtml}
	</div>
	${footerText ? `<p style="max-width: 560px; margin: 16px auto 0; font-size: 12px; line-height: 1.5; color: #78716c; text-align: center;">${footerText}</p>` : ''}
</body>
</html>`;
}

/** A body paragraph for `emailLayout()`. Escape user data before passing it in. */
export function paragraph(html: string): string {
	return `<p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #44403c;">${html}</p>`;
}

/** A call-to-action button for `emailLayout()`. `href` must be app-controlled. */
export function button(href: string, label: string): string {
	return `<a href="${escapeHtml(href)}" style="display: inline-block; margin: 8px 0 16px; padding: 10px 20px; background-color: #1c1917; color: #ffffff; font-size: 14px; font-weight: 500; text-decoration: none; border-radius: 6px;">${escapeHtml(label)}</a>`;
}

/** Sent after signup. Example of the personalization + escaping pattern. */
export function welcomeEmail({
	name,
	appName,
	appUrl
}: {
	name: string;
	appName: string;
	appUrl: string;
}): EmailTemplate {
	return {
		subject: `Welcome to ${appName}`,
		html: emailLayout({
			heading: `Welcome, ${escapeHtml(name)}!`,
			bodyHtml:
				paragraph(
					`Your ${escapeHtml(appName)} account is ready. Jump back in whenever you like — everything picks up right where you left off.`
				) + button(appUrl, `Open ${appName}`),
			footerText: `You're receiving this because you signed up for ${escapeHtml(appName)}.`
		}),
		text: [
			`Welcome, ${name}!`,
			'',
			`Your ${appName} account is ready. Jump back in whenever you like: ${appUrl}`,
			'',
			`You're receiving this because you signed up for ${appName}.`
		].join('\n')
	};
}

/**
 * The generic workhorse: a heading, a message, and an optional call-to-action.
 * Reach for this before writing a bespoke template for one-off notifications.
 */
export function notificationEmail({
	subject,
	heading,
	message,
	cta
}: {
	subject: string;
	heading: string;
	message: string;
	cta?: { label: string; url: string };
}): EmailTemplate {
	return {
		subject,
		html: emailLayout({
			heading: escapeHtml(heading),
			bodyHtml: paragraph(escapeHtml(message)) + (cta ? button(cta.url, cta.label) : '')
		}),
		text: [heading, '', message, ...(cta ? ['', `${cta.label}: ${cta.url}`] : [])].join('\n')
	};
}
