import { OAuthProvider, type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { decodeState, encodeState, renderAuthorizePage } from './authorize';
import { createKanbanServer } from './tools';

type WorkerEnv = Env & {
	MCP_TOKEN: string;
	OAUTH_PROVIDER: OAuthHelpers;
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

function checkStaticToken(request: Request, env: WorkerEnv): boolean {
	const header = request.headers.get('Authorization') ?? '';
	const match = /^Bearer\s+(.+)$/i.exec(header);
	if (!match) return false;
	const expected = env.MCP_TOKEN;
	if (!expected) return false;
	return timingSafeEqual(match[1].trim(), expected);
}

// Stateless Streamable HTTP — new server+transport per request.
// No auth here: requests arrive either via the static-token fast path below
// or through OAuthProvider, which has already validated an access token.
const mcpHandler = {
	async fetch(request: Request, env: WorkerEnv): Promise<Response> {
		const server = createKanbanServer(env.DB, env.MEDIA);
		const transport = new WebStandardStreamableHTTPServerTransport({
			// no sessionIdGenerator => stateless
			enableJsonResponse: true
		});
		await server.connect(transport);
		return transport.handleRequest(request);
	}
} satisfies ExportedHandler<WorkerEnv>;

async function handleAuthorize(request: Request, env: WorkerEnv): Promise<Response> {
	const provider = env.OAUTH_PROVIDER;

	if (request.method === 'GET') {
		const reqInfo = await provider.parseAuthRequest(request);
		const client = await provider.lookupClient(reqInfo.clientId);
		return renderAuthorizePage({
			clientName: client?.clientName ?? reqInfo.clientId,
			encodedReqInfo: encodeState(reqInfo)
		});
	}

	if (request.method === 'POST') {
		const form = await request.formData();
		const token = form.get('token');
		const encodedReqInfo = form.get('oauth_req');
		if (typeof token !== 'string' || typeof encodedReqInfo !== 'string') {
			return new Response('Bad request', { status: 400 });
		}

		let reqInfo: AuthRequest;
		try {
			reqInfo = decodeState<AuthRequest>(encodedReqInfo);
		} catch {
			return new Response('Bad request', { status: 400 });
		}

		if (!env.MCP_TOKEN || !timingSafeEqual(token.trim(), env.MCP_TOKEN)) {
			const client = await provider.lookupClient(reqInfo.clientId);
			return renderAuthorizePage({
				clientName: client?.clientName ?? reqInfo.clientId,
				encodedReqInfo,
				error: 'Invalid token, try again.'
			});
		}

		const { redirectTo } = await provider.completeAuthorization({
			request: reqInfo,
			userId: 'owner',
			metadata: {},
			scope: reqInfo.scope,
			props: {}
		});
		return Response.redirect(redirectTo, 302);
	}

	return new Response('Method not allowed', { status: 405 });
}

const defaultHandler = {
	async fetch(request: Request, env: WorkerEnv): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/' || url.pathname === '/health') {
			return new Response('easytodo mcp ok', { status: 200 });
		}

		if (url.pathname === '/authorize') {
			return handleAuthorize(request, env);
		}

		return new Response('Not found', { status: 404 });
	}
} satisfies ExportedHandler<WorkerEnv>;

const provider = new OAuthProvider<WorkerEnv>({
	apiRoute: '/mcp',
	apiHandler: mcpHandler,
	defaultHandler,
	authorizeEndpoint: '/authorize',
	tokenEndpoint: '/token',
	clientRegistrationEndpoint: '/register'
});

export default {
	async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Fast path: existing clients (Claude Code, scripts, API connector)
		// that send the static secret directly. Everything else — including
		// /mcp with an OAuth access token — goes through the provider.
		if (url.pathname === '/mcp' && checkStaticToken(request, env)) {
			return mcpHandler.fetch(request, env);
		}

		return provider.fetch(request, env, ctx);
	}
} satisfies ExportedHandler<WorkerEnv>;
