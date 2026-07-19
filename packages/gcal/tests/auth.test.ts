import { describe, expect, it } from 'vitest';
import { createUnsignedJwt, GOOGLE_CALENDAR_SCOPE, GOOGLE_TOKEN_URL } from '../src/auth';

function decodePart(part: string): unknown {
	const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
	return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))));
}

describe('createUnsignedJwt', () => {
	it('assembles the required RS256 service-account claims', () => {
		const jwt = createUnsignedJwt('calendar@example.iam.gserviceaccount.com', 1_700_000_000);
		const [header, claims] = jwt.signingInput.split('.').map(decodePart);

		expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
		expect(claims).toEqual({
			iss: 'calendar@example.iam.gserviceaccount.com',
			scope: GOOGLE_CALENDAR_SCOPE,
			aud: GOOGLE_TOKEN_URL,
			iat: 1_700_000_000,
			exp: 1_700_003_600
		});
	});
});
