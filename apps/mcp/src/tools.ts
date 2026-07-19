import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { CardAttachment, D1Database } from '@easytodo/db';
import {
	DbError,
	archiveCard,
	createCard,
	createCardAttachment,
	createColumn,
	createProject,
	deleteCardAttachment,
	getBoard,
	getCard,
	getCardAttachment,
	listProjects,
	moveCard,
	normalizeDueAt,
	renameColumn,
	updateCard
} from '@easytodo/db';
import {
	bytesToBase64,
	MAX_BASE64_INPUT_CHARS,
	MAX_IMAGE_BYTES,
	prepareImageInput
} from './images';

function textResult(data: unknown): CallToolResult {
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }]
	};
}

function errorResult(message: string): CallToolResult {
	return {
		isError: true as const,
		content: [{ type: 'text' as const, text: message }]
	};
}

function publicAttachment(attachment: CardAttachment) {
	return {
		id: attachment.id,
		card_id: attachment.card_id,
		file_name: attachment.file_name,
		content_type: attachment.content_type,
		byte_size: attachment.byte_size,
		width: attachment.width,
		height: attachment.height,
		created_at: attachment.created_at
	};
}

function truncateBody(body: string, max = 200): string {
	if (body.length <= max) return body;
	return body.slice(0, max) + '…';
}

const dueAtSchema = z
	.union([z.string(), z.null()])
	.refine(
		(value) => {
			try {
				normalizeDueAt(value);
				return true;
			} catch {
				return false;
			}
		},
		{
			message: 'Use YYYY-MM-DD for all-day, an ISO 8601 UTC datetime ending in Z, or null'
		}
	);

export function createKanbanServer(db: D1Database, media: R2Bucket) {
	const server = new McpServer({
		name: 'easytodo-kanban',
		version: '1.0.0'
	});

	server.tool('list_projects', 'List all kanban projects (id, name, slug)', {}, async () => {
		try {
			const projects = await listProjects(db);
			return textResult(projects.map((p) => ({ id: p.id, name: p.name, slug: p.slug })));
		} catch (e) {
			return errorResult(e instanceof Error ? e.message : String(e));
		}
	});

	server.tool(
		'get_board',
		'Get a project board: columns with non-archived cards (body truncated)',
		{
			project: z.union([z.string(), z.number()]).describe('Project slug or id')
		},
		async ({ project }) => {
			try {
				const board = await getBoard(db, project);
				return textResult({
					project: {
						id: board.project.id,
						name: board.project.name,
						slug: board.project.slug
					},
					columns: board.columns.map((c) => ({
						id: c.id,
						name: c.name,
						cards: c.cards.map((card) => ({
							id: card.id,
							title: card.title,
							body_preview: truncateBody(card.body_md),
							due_at: card.due_at,
							updated_at: card.updated_at,
							images: card.attachments.map(publicAttachment)
						}))
					}))
				});
			} catch (e) {
				return errorResult(e instanceof DbError ? e.message : String(e));
			}
		}
	);

	server.tool(
		'get_card',
		'Get full card including complete body_md',
		{ card_id: z.number().int().describe('Card id') },
		async ({ card_id }) => {
			try {
				const card = await getCard(db, card_id);
				const { attachments, ...details } = card;
				return textResult({
					...details,
					attachments: attachments.map(publicAttachment)
				});
			} catch (e) {
				return errorResult(e instanceof DbError ? e.message : String(e));
			}
		}
	);

	server.tool(
		'create_card',
		'Create a card in a column (append, or top if top=true)',
		{
			project: z.union([z.string(), z.number()]),
			column: z.union([z.string(), z.number()]).describe('Column name or id'),
			title: z.string(),
			body_md: z.string().optional(),
			due_at: dueAtSchema
				.optional()
				.describe('All-day YYYY-MM-DD, UTC ISO datetime ending in Z, or null'),
			top: z.boolean().optional()
		},
		async (args) => {
			try {
				const card = await createCard(db, args);
				return textResult(card);
			} catch (e) {
				return errorResult(e instanceof DbError ? e.message : String(e));
			}
		}
	);

	server.tool(
		'update_card',
		'Partial update of card title, body_md, and/or deadline',
		{
			card_id: z.number().int(),
			title: z.string().optional(),
			body_md: z.string().optional(),
			due_at: dueAtSchema
				.optional()
				.describe('All-day YYYY-MM-DD, UTC ISO datetime ending in Z, or null to clear')
		},
		async ({ card_id, title, body_md, due_at }) => {
			try {
				const card = await updateCard(db, card_id, { title, body_md, due_at });
				return textResult(card);
			} catch (e) {
				return errorResult(e instanceof DbError ? e.message : String(e));
			}
		}
	);

	server.tool(
		'move_card',
		'Move a card to a column (optionally before another card); default end of column',
		{
			card_id: z.number().int(),
			column: z.union([z.string(), z.number()]),
			before_card_id: z.number().int().optional()
		},
		async ({ card_id, column, before_card_id }) => {
			try {
				const card = await moveCard(db, card_id, {
					column,
					before_card_id: before_card_id ?? null
				});
				return textResult(card);
			} catch (e) {
				return errorResult(e instanceof DbError ? e.message : String(e));
			}
		}
	);

	server.tool(
		'archive_card',
		'Soft-delete (archive) a card',
		{ card_id: z.number().int() },
		async ({ card_id }) => {
			try {
				const card = await archiveCard(db, card_id);
				return textResult(card);
			} catch (e) {
				return errorResult(e instanceof DbError ? e.message : String(e));
			}
		}
	);

	server.tool(
		'create_column',
		'Append a column to a project',
		{
			project: z.union([z.string(), z.number()]),
			name: z.string()
		},
		async ({ project, name }) => {
			try {
				const col = await createColumn(db, project, name);
				return textResult(col);
			} catch (e) {
				return errorResult(e instanceof DbError ? e.message : String(e));
			}
		}
	);

	server.tool(
		'rename_column',
		'Rename a column by id',
		{
			column_id: z.number().int(),
			name: z.string()
		},
		async ({ column_id, name }) => {
			try {
				const col = await renameColumn(db, column_id, name);
				return textResult(col);
			} catch (e) {
				return errorResult(e instanceof DbError ? e.message : String(e));
			}
		}
	);

	server.tool(
		'create_project',
		'Create a project seeded with Todo / Doing / Done',
		{ name: z.string() },
		async ({ name }) => {
			try {
				const project = await createProject(db, name);
				return textResult(project);
			} catch (e) {
				return errorResult(e instanceof DbError ? e.message : String(e));
			}
		}
	);

	server.registerTool(
		'add_card_image',
		{
			title: 'Add card image',
			description:
				'Attach a JPEG, PNG, or WebP image to a card from one HTTPS URL or base64 payload. The image must already be compressed below 2.5 MB.',
			inputSchema: {
				card_id: z.number().int().positive().describe('Card id'),
				image_url: z
					.string()
					.url()
					.max(2048)
					.optional()
					.describe('Public HTTPS image URL; mutually exclusive with image_base64'),
				image_base64: z
					.string()
					.max(MAX_BASE64_INPUT_CHARS)
					.optional()
					.describe('Base64 bytes or a data:image/...;base64 URL'),
				mime_type: z
					.enum(['image/jpeg', 'image/png', 'image/webp'])
					.optional()
					.describe('Optional declared MIME type for plain base64 input'),
				file_name: z.string().min(1).max(160).optional()
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: true
			}
		},
		async ({ card_id, image_url, image_base64, mime_type, file_name }) => {
			try {
				await getCard(db, card_id);
				const image = await prepareImageInput({
					imageUrl: image_url,
					imageBase64: image_base64,
					mimeType: mime_type,
					fileName: file_name
				});
				const id = crypto.randomUUID();
				const extension = image.contentType === 'image/jpeg' ? 'jpg' : image.contentType.split('/')[1];
				const objectKey = `cards/${card_id}/${id}.${extension}`;
				await media.put(objectKey, image.bytes, {
					httpMetadata: {
						contentType: image.contentType,
						cacheControl: 'private, max-age=86400'
					}
				});

				try {
					const attachment = await createCardAttachment(db, {
						id,
						card_id,
						object_key: objectKey,
						file_name: image.fileName,
						content_type: image.contentType,
						byte_size: image.bytes.byteLength,
						width: image.width,
						height: image.height
					});
					return textResult(publicAttachment(attachment));
				} catch (cause) {
					await media.delete(objectKey);
					throw cause;
				}
			} catch (cause) {
				return errorResult(cause instanceof Error ? cause.message : String(cause));
			}
		}
	);

	server.registerTool(
		'get_card_image',
		{
			title: 'Read card image',
			description:
				'Read an attachment from R2 and return it as MCP image content for a vision-capable client.',
			inputSchema: {
				attachment_id: z.string().uuid().describe('Attachment id returned by get_card or get_board')
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async ({ attachment_id }) => {
			try {
				const attachment = await getCardAttachment(db, attachment_id);
				const object = await media.get(attachment.object_key);
				if (!object) return errorResult(`image file for attachment '${attachment_id}' not found`);
				if (object.size > MAX_IMAGE_BYTES) {
					return errorResult('Stored image exceeds the 2.5 MB MCP response limit.');
				}
				const bytes = new Uint8Array(await object.arrayBuffer());
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(publicAttachment(attachment), null, 2)
						},
						{
							type: 'image' as const,
							data: bytesToBase64(bytes),
							mimeType: attachment.content_type
						}
					]
				};
			} catch (cause) {
				return errorResult(cause instanceof Error ? cause.message : String(cause));
			}
		}
	);

	server.registerTool(
		'delete_card_image',
		{
			title: 'Delete card image',
			description: 'Permanently remove one card attachment from R2 and D1.',
			inputSchema: {
				attachment_id: z.string().uuid().describe('Attachment id returned by get_card or get_board')
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
				openWorldHint: false
			}
		},
		async ({ attachment_id }) => {
			try {
				const attachment = await getCardAttachment(db, attachment_id);
				await media.delete(attachment.object_key);
				await deleteCardAttachment(db, attachment.id);
				return textResult({ ok: true, deleted_attachment_id: attachment.id });
			} catch (cause) {
				return errorResult(cause instanceof Error ? cause.message : String(cause));
			}
		}
	);

	return server;
}
