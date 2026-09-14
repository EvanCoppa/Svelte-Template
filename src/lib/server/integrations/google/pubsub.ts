/**
 * Pub/Sub push — proving a Gmail notification really came from Google.
 *
 * Gmail's push notifications arrive as Cloud Pub/Sub push deliveries: an
 * HTTPS POST to this app carrying a bearer OIDC token that Google signed on
 * behalf of the subscription's service account. `verifyPushToken()` is the
 * gate the push endpoint runs before it trusts the body — the RS256 signature
 * against Google's published certificates, then every claim the docs say to
 * check — and `parsePushBody()` reads what the delivery says once it is
 * trusted: which mailbox moved, and the history id to sync from. The endpoint
 * itself, and what it does with a history id, is the sync half's; nothing
 * here touches a row.
 *
 * Configuration is entirely env-driven:
 *
 *   GOOGLE_PUSH_SERVICE_ACCOUNT  the service account the subscription signs as
 *   GOOGLE_PUSH_AUDIENCE         the audience set on the subscription (by
 *                                default the push endpoint's own URL)
 *
 * Google's certificates are cached in this module for an hour, keyed by
 * `kid`, and an unfamiliar key id refetches them at most once a minute, so a
 * key rotation is picked up without a flood of forged tokens turning into a
 * flood of fetches. Node's own `crypto` does the verification — no JWT
 * library. Nothing here throws: a verification resolves to a
 * `PushVerification`, a body to the notification or `null`.
 *
 * https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions
 * https://developers.google.com/workspace/gmail/api/guides/push
 */
import { createPublicKey, verify as verifySignature, type JsonWebKey } from 'node:crypto';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import type { Json } from '$lib/database.types';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const CERTS_TTL_MS = 60 * 60 * 1000;
const CERTS_REFETCH_COOLDOWN_MS = 60 * 1000;
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/**
 * The env vars push verification reads, injectable so tests can vary them.
 * The index signature is what lets the real `$env/dynamic/private` env
 * satisfy this — see `EmailEnv` for why.
 */
export interface PushEnv {
	GOOGLE_PUSH_SERVICE_ACCOUNT?: string | undefined;
	GOOGLE_PUSH_AUDIENCE?: string | undefined;
	[key: string]: string | undefined;
}

export interface PushConfig {
	serviceAccount: string;
	audience: string;
}

/**
 * Resolve what a push delivery must prove, or `null` when push is off. Half a
 * configuration is refused loudly: an audience without a service account
 * would accept any Google-signed token.
 */
export function pushConfig(source: PushEnv = env): PushConfig | null {
	const serviceAccount = (source.GOOGLE_PUSH_SERVICE_ACCOUNT ?? '').trim();
	const audience = (source.GOOGLE_PUSH_AUDIENCE ?? '').trim();
	if (!serviceAccount && !audience) return null;
	if (!serviceAccount || !audience) {
		console.error(
			'[google] GOOGLE_PUSH_SERVICE_ACCOUNT and GOOGLE_PUSH_AUDIENCE must both be set — ' +
				'push notifications disabled.'
		);
		return null;
	}
	return { serviceAccount, audience };
}

export type PushVerification = { ok: true; email: string } | { ok: false; error: string };

export interface PushVerifyDeps {
	/** Override the fetch used for Google's certificates (tests). */
	fetchImpl?: typeof fetch;
	/** Override the clock `exp` is checked against (tests). */
	now?: () => Date;
	/** Signing keys to use instead of fetching Google's (tests). */
	jwks?: readonly JsonWebKey[];
}

const jwtHeaderSchema = z.object({ alg: z.string(), kid: z.string().optional() });
const jwtClaimsSchema = z.object({
	iss: z.string().optional(),
	aud: z.union([z.string().transform((aud) => [aud]), z.array(z.string())]).optional(),
	exp: z.number().optional(),
	email: z.string().optional(),
	email_verified: z.boolean().optional()
});

/** One of Google's published RSA keys, as `oauth2/v3/certs` lists them. */
const googleJwkSchema = z.object({
	kid: z.string(),
	kty: z.string(),
	n: z.string(),
	e: z.string(),
	alg: z.string().optional(),
	use: z.string().optional()
});
const certsSchema = z.object({ keys: z.array(googleJwkSchema) });
type GoogleJwk = z.infer<typeof googleJwkSchema>;

interface CertCache {
	keys: Map<string, GoogleJwk>;
	fetchedAt: number;
	expiresAt: number;
}

let certCache: CertCache | null = null;

/** A base64url JSON segment (a JWT header, a JWT payload, a Pub/Sub `data`) through a schema, or `null`. */
function decodeJsonSegment<T>(segment: string, schema: z.ZodType<T>): T | null {
	try {
		const parsed = schema.safeParse(JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

async function fetchCerts(fetchImpl: typeof fetch, now: number): Promise<CertCache | null> {
	try {
		const response = await fetchImpl(CERTS_URL, { headers: { accept: 'application/json' } });
		if (!response.ok) return null;
		const parsed = certsSchema.safeParse(await response.json());
		if (!parsed.success) return null;
		return {
			keys: new Map(parsed.data.keys.map((key): [string, GoogleJwk] => [key.kid, key])),
			fetchedAt: now,
			expiresAt: now + CERTS_TTL_MS
		};
	} catch {
		return null;
	}
}

/** The key a token names, from the injected set, the hour-long cache, or a fresh fetch. */
async function signingKey(
	kid: string,
	deps: PushVerifyDeps,
	now: number
): Promise<JsonWebKey | null> {
	if (deps.jwks) return deps.jwks.find((key) => key.kid === kid) ?? null;
	const cached = certCache !== null && certCache.expiresAt > now ? certCache : null;
	const hit = cached?.keys.get(kid);
	if (hit) return hit;
	if (cached !== null && now - cached.fetchedAt < CERTS_REFETCH_COOLDOWN_MS) return null;
	const fetched = await fetchCerts(deps.fetchImpl ?? fetch, now);
	if (fetched === null) return null;
	certCache = fetched;
	return fetched.keys.get(kid) ?? null;
}

function signatureValid(signingInput: string, signature: string, jwk: JsonWebKey): boolean {
	try {
		const key = createPublicKey({ key: jwk, format: 'jwk' });
		return verifySignature(
			'RSA-SHA256',
			Buffer.from(signingInput),
			key,
			Buffer.from(signature, 'base64url')
		);
	} catch {
		return false;
	}
}

/**
 * Check the `Authorization: Bearer <jwt>` a push delivery carries: an RS256
 * signature by one of Google's published keys, then the issuer, the
 * audience, the expiry, the service account and its verified email — in that
 * order, so a forged token is refused before its claims are read. `ok` hands
 * back the service account that signed.
 */
export async function verifyPushToken(
	authorization: string | null | undefined,
	config: PushConfig,
	deps: PushVerifyDeps = {}
): Promise<PushVerification> {
	const refused = (error: string): PushVerification => ({ ok: false, error });
	const token = /^Bearer\s+(\S+)$/i.exec((authorization ?? '').trim())?.[1];
	if (!token) return refused('No bearer token.');
	const [encodedHeader, encodedClaims, signature, ...rest] = token.split('.');
	if (!encodedHeader || !encodedClaims || !signature || rest.length > 0) {
		return refused('Malformed token.');
	}
	const header = decodeJsonSegment(encodedHeader, jwtHeaderSchema);
	if (header === null) return refused('Unreadable token header.');
	if (header.alg !== 'RS256') return refused(`Unsupported algorithm ${header.alg}.`);
	if (!header.kid) return refused('Token names no signing key.');
	const claims = decodeJsonSegment(encodedClaims, jwtClaimsSchema);
	if (claims === null) return refused('Unreadable token claims.');

	const nowMs = (deps.now ?? (() => new Date()))().getTime();
	const jwk = await signingKey(header.kid, deps, nowMs);
	if (jwk === null) return refused('Unknown signing key.');
	if (!signatureValid(`${encodedHeader}.${encodedClaims}`, signature, jwk)) {
		return refused('Bad signature.');
	}

	if (!claims.iss || !ISSUERS.has(claims.iss)) return refused('Unexpected issuer.');
	if (!(claims.aud ?? []).includes(config.audience)) return refused('Unexpected audience.');
	if (claims.exp === undefined || claims.exp * 1000 <= nowMs) return refused('Token expired.');
	if (claims.email !== config.serviceAccount) return refused('Unexpected service account.');
	if (claims.email_verified !== true) return refused('Service account email not verified.');
	return { ok: true, email: claims.email };
}

/** What Gmail publishes: the mailbox that changed and where its history now stands. */
export type PushNotification = { emailAddress: string; historyId: string };

const pushEnvelopeSchema = z.object({ message: z.object({ data: z.string() }) });
const pushNotificationSchema = z.object({
	emailAddress: z.string().min(1),
	historyId: z.union([z.string(), z.number()]).transform((id) => String(id))
});

/**
 * The notification inside a push delivery's JSON body —
 * `{ message: { data: <base64 of {"emailAddress","historyId"}> }, subscription }`,
 * the base64 standard or url-safe, the history id a number or a string.
 * `null` for anything else; the endpoint answers 400 and Pub/Sub does not
 * retry.
 */
export function parsePushBody(body: Json): PushNotification | null {
	const envelope = pushEnvelopeSchema.safeParse(body);
	if (!envelope.success) return null;
	return decodeJsonSegment(envelope.data.message.data, pushNotificationSchema);
}
