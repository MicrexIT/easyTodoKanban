/**
 * Minimal single-user consent screen for the OAuth flow.
 * The user proves ownership by pasting the MCP_TOKEN secret; there are no
 * accounts. The parsed authorization request is round-tripped through a
 * hidden form field (it is client-supplied data anyway — PKCE binds the
 * resulting code to the requesting client).
 */

export function encodeState(value: unknown): string {
	const bytes = new TextEncoder().encode(JSON.stringify(value));
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export function decodeState<T>(encoded: string): T {
	const binary = atob(encoded);
	const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
	return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function renderAuthorizePage(options: {
	clientName: string;
	encodedReqInfo: string;
	error?: string;
}): Response {
	const { clientName, encodedReqInfo, error } = options;
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Authorize — easyTodoKanban</title>
<style>
	:root { color-scheme: light dark; }
	body {
		margin: 0; min-height: 100dvh; display: grid; place-items: center;
		font-family: system-ui, -apple-system, sans-serif;
		background: light-dark(#f6f4f1, #191817); color: light-dark(#2c2a28, #eceae7);
	}
	main {
		width: min(92vw, 22rem); padding: 2rem;
		background: light-dark(#fffdfa, #232120);
		border: 1px solid light-dark(#e4e0da, #37342f); border-radius: 1rem;
	}
	h1 { font-size: 1.15rem; margin: 0 0 0.25rem; }
	p { margin: 0.25rem 0 1.25rem; font-size: 0.9rem; opacity: 0.75; line-height: 1.45; }
	label { display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.4rem; }
	input[type="password"] {
		width: 100%; box-sizing: border-box; padding: 0.6rem 0.7rem; font-size: 0.95rem;
		border: 1px solid light-dark(#d5d0c8, #46423c); border-radius: 0.5rem;
		background: light-dark(#fff, #191817); color: inherit;
	}
	button {
		margin-top: 1rem; width: 100%; padding: 0.65rem; font-size: 0.95rem; font-weight: 600;
		border: none; border-radius: 0.5rem; cursor: pointer;
		background: #c2410c; color: #fff;
	}
	.error { color: #dc2626; font-size: 0.85rem; margin: 0.75rem 0 0; }
</style>
</head>
<body>
<main>
	<h1>🍰 easyTodoKanban</h1>
	<p><strong>${escapeHtml(clientName)}</strong> is requesting access to your kanban board. Paste your MCP token to allow it.</p>
	<form method="post" action="/authorize">
		<input type="hidden" name="oauth_req" value="${escapeHtml(encodedReqInfo)}" />
		<label for="token">MCP token</label>
		<input id="token" name="token" type="password" autocomplete="off" required autofocus />
		${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
		<button type="submit">Allow access</button>
	</form>
</main>
</body>
</html>`;
	return new Response(html, {
		status: error ? 401 : 200,
		headers: { 'Content-Type': 'text/html; charset=utf-8' }
	});
}
