export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleServiceAccountCredentials = {
	serviceAccountEmail: string;
	privateKey: string;
};

type TokenResponse = {
	access_token: string;
	expires_in: number;
};

type CachedToken = {
	serviceAccountEmail: string;
	accessToken: string;
	expiresAtMs: number;
};

let cachedToken: CachedToken | null = null;

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function jsonToBase64Url(value: unknown): string {
	return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export function createUnsignedJwt(
	serviceAccountEmail: string,
	issuedAtSeconds: number
): { signingInput: string; claims: Record<string, string | number> } {
	const header = { alg: 'RS256', typ: 'JWT' };
	const claims = {
		iss: serviceAccountEmail,
		scope: GOOGLE_CALENDAR_SCOPE,
		aud: GOOGLE_TOKEN_URL,
		iat: issuedAtSeconds,
		exp: issuedAtSeconds + 3600
	};
	return {
		signingInput: `${jsonToBase64Url(header)}.${jsonToBase64Url(claims)}`,
		claims
	};
}

function pemToPkcs8(privateKey: string): ArrayBuffer {
	const normalized = privateKey.replace(/\\n/g, '\n').trim();
	const base64 = normalized
		.replace(/-----BEGIN PRIVATE KEY-----/g, '')
		.replace(/-----END PRIVATE KEY-----/g, '')
		.replace(/\s/g, '');
	if (!base64) throw new Error('GOOGLE_SA_KEY is not a PKCS8 private key');

	let binary: string;
	try {
		binary = atob(base64);
	} catch {
		throw new Error('GOOGLE_SA_KEY contains invalid base64');
	}
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes.buffer;
}

async function signJwt(privateKey: string, signingInput: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'pkcs8',
		pemToPkcs8(privateKey),
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		key,
		new TextEncoder().encode(signingInput)
	);
	return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
	if (!response.body) return '';
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let total = 0;
	let result = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new Error('Google OAuth response exceeded the safety limit');
		}
		result += decoder.decode(value, { stream: true });
	}
	return result + decoder.decode();
}

export async function getAccessToken(
	credentials: GoogleServiceAccountCredentials,
	options: { fetch?: typeof fetch; nowMs?: number } = {}
): Promise<string> {
	const nowMs = options.nowMs ?? Date.now();
	if (
		cachedToken?.serviceAccountEmail === credentials.serviceAccountEmail &&
		cachedToken.expiresAtMs - nowMs > 60_000
	) {
		return cachedToken.accessToken;
	}

	const nowSeconds = Math.floor(nowMs / 1000);
	const { signingInput } = createUnsignedJwt(credentials.serviceAccountEmail, nowSeconds);
	const assertion = await signJwt(credentials.privateKey, signingInput);
	const body = new URLSearchParams({
		grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
		assertion
	});
	const response = await (options.fetch ?? fetch)(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body
	});
	const raw = await readLimitedText(response, 32 * 1024);
	if (!response.ok) {
		throw new Error(`Google OAuth token exchange failed (${response.status}): ${raw}`);
	}

	let token: TokenResponse;
	try {
		token = JSON.parse(raw) as TokenResponse;
	} catch {
		throw new Error('Google OAuth returned invalid JSON');
	}
	if (!token.access_token || !Number.isFinite(token.expires_in)) {
		throw new Error('Google OAuth response did not include an access token');
	}

	cachedToken = {
		serviceAccountEmail: credentials.serviceAccountEmail,
		accessToken: token.access_token,
		expiresAtMs: nowMs + token.expires_in * 1000
	};
	return token.access_token;
}

export async function readGoogleResponse(
	response: Response,
	maxBytes = 1024 * 1024
): Promise<string> {
	return readLimitedText(response, maxBytes);
}
