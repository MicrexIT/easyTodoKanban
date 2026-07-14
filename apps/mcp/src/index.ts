import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { D1Database } from '@easytodo/db';
import { createKanbanServer } from './tools';

export interface Env {
	DB: D1Database;
	MCP_TOKEN: string;
}

function timingSafeEqual(a: string, b: string): boolean {
	const max = Math.max(a.length, b.length);
	let out = a.length === b.length ? 0 : 1;
	for (let i = 0; i < max; i++) {
		out |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
	}
	return out === 0;
}

function unauthorized(): Response {
	return new Response('Unauthorized — send Authorization: Bearer <MCP_TOKEN>', {
		status: 401,
		headers: { 'WWW-Authenticate': 'Bearer' }
	});
}

function checkAuth(request: Request, env: Env): boolean {
	const header = request.headers.get('Authorization') ?? '';
	const match = /^Bearer\s+(.+)$/i.exec(header);
	if (!match) return false;
	const expected = env.MCP_TOKEN;
	if (!expected) return false;
	return timingSafeEqual(match[1].trim(), expected);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/' || url.pathname === '/health') {
			return new Response('easytodo mcp ok', { status: 200 });
		}

		if (url.pathname === '/mcp') {
			if (!checkAuth(request, env)) return unauthorized();

			// Stateless Streamable HTTP — new server+transport per request
			const server = createKanbanServer(env.DB);
			const transport = new WebStandardStreamableHTTPServerTransport({
				// no sessionIdGenerator => stateless
				enableJsonResponse: true
			});
			await server.connect(transport);
			return transport.handleRequest(request);
		}

		return new Response('Not found', { status: 404 });
	}
};
