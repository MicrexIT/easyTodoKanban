import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createKanbanServer } from './tools';

type WorkerEnv = Env & {
	MCP_TOKEN: string;
};

const textEncoder = new TextEncoder();

function timingSafeEqual(a: string, b: string): boolean {
	const aBytes = textEncoder.encode(a);
	const bBytes = textEncoder.encode(b);
	if (aBytes.byteLength !== bBytes.byteLength) {
		return !crypto.subtle.timingSafeEqual(aBytes, aBytes);
	}
	return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

function unauthorized(): Response {
	return new Response('Unauthorized — send Authorization: Bearer <MCP_TOKEN>', {
		status: 401,
		headers: { 'WWW-Authenticate': 'Bearer' }
	});
}

function checkAuth(request: Request, env: WorkerEnv): boolean {
	const header = request.headers.get('Authorization') ?? '';
	const match = /^Bearer\s+(.+)$/i.exec(header);
	if (!match) return false;
	const expected = env.MCP_TOKEN;
	if (!expected) return false;
	return timingSafeEqual(match[1].trim(), expected);
}

export default {
	async fetch(request: Request, env: WorkerEnv): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/' || url.pathname === '/health') {
			return new Response('easytodo mcp ok', { status: 200 });
		}

		if (url.pathname === '/mcp') {
			if (!checkAuth(request, env)) return unauthorized();

			// Stateless Streamable HTTP — new server+transport per request
			const server = createKanbanServer(env.DB, env.MEDIA);
			const transport = new WebStandardStreamableHTTPServerTransport({
				// no sessionIdGenerator => stateless
				enableJsonResponse: true
			});
			await server.connect(transport);
			return transport.handleRequest(request);
		}

		return new Response('Not found', { status: 404 });
	}
} satisfies ExportedHandler<WorkerEnv>;
