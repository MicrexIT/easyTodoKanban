import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { D1Database } from '@easytodo/db';
import {
	DbError,
	archiveCard,
	createCard,
	createColumn,
	createProject,
	getBoard,
	getCard,
	listProjects,
	moveCard,
	renameColumn,
	updateCard
} from '@easytodo/db';

function textResult(data: unknown) {
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }]
	};
}

function errorResult(message: string) {
	return {
		isError: true as const,
		content: [{ type: 'text' as const, text: message }]
	};
}

function truncateBody(body: string, max = 200): string {
	if (body.length <= max) return body;
	return body.slice(0, max) + '…';
}

export function createKanbanServer(db: D1Database) {
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
							updated_at: card.updated_at
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
				return textResult(card);
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
		'Partial update of card title and/or body_md',
		{
			card_id: z.number().int(),
			title: z.string().optional(),
			body_md: z.string().optional()
		},
		async ({ card_id, title, body_md }) => {
			try {
				const card = await updateCard(db, card_id, { title, body_md });
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

	return server;
}
