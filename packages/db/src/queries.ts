import { positionBetween, needsRenumber, renumberPositions } from './position.js';
import type {
	Board,
	Card,
	CardAttachment,
	CardDetail,
	CardWithContext,
	Column,
	D1Database,
	D1PreparedStatement,
	Project
} from './types.js';
import { DbError } from './types.js';

function slugify(name: string): string {
	const base = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return base || 'project';
}

async function uniqueSlug(db: D1Database, name: string): Promise<string> {
	const base = slugify(name);
	let slug = base;
	let n = 2;
	for (;;) {
		const existing = await db
			.prepare('SELECT id FROM projects WHERE slug = ?')
			.bind(slug)
			.first<{ id: number }>();
		if (!existing) return slug;
		slug = `${base}-${n++}`;
	}
}

export async function listProjects(db: D1Database): Promise<Project[]> {
	const { results } = await db
		.prepare('SELECT * FROM projects ORDER BY position ASC, id ASC')
		.all<Project>();
	return results;
}

export async function resolveProject(
	db: D1Database,
	project: string | number
): Promise<Project> {
	const isId = typeof project === 'number' || /^\d+$/.test(String(project));
	const row = isId
		? await db
				.prepare('SELECT * FROM projects WHERE id = ?')
				.bind(Number(project))
				.first<Project>()
		: await db
				.prepare('SELECT * FROM projects WHERE slug = ? OR lower(name) = lower(?)')
				.bind(String(project), String(project))
				.first<Project>();
	if (!row) {
		const all = await listProjects(db);
		const names = all.map((p) => p.slug).join(', ') || '(none)';
		throw new DbError(`project '${project}' not found — available: ${names}`);
	}
	return row;
}

export async function resolveColumn(
	db: D1Database,
	project: Project | string | number,
	column: string | number
): Promise<Column> {
	const proj = typeof project === 'object' ? project : await resolveProject(db, project);
	const isId = typeof column === 'number' || /^\d+$/.test(String(column));
	const row = isId
		? await db
				.prepare('SELECT * FROM columns WHERE id = ? AND project_id = ?')
				.bind(Number(column), proj.id)
				.first<Column>()
		: await db
				.prepare(
					'SELECT * FROM columns WHERE project_id = ? AND lower(name) = lower(?)'
				)
				.bind(proj.id, String(column))
				.first<Column>();
	if (!row) {
		const { results } = await db
			.prepare('SELECT name FROM columns WHERE project_id = ? ORDER BY position')
			.bind(proj.id)
			.all<{ name: string }>();
		const names = results.map((c) => c.name).join(', ') || '(none)';
		throw new DbError(
			`column '${column}' not found in project '${proj.slug}' — available: ${names}`
		);
	}
	return row;
}

export async function getBoard(
	db: D1Database,
	projectRef: string | number
): Promise<Board> {
	const project = await resolveProject(db, projectRef);
	const { results: columns } = await db
		.prepare('SELECT * FROM columns WHERE project_id = ? ORDER BY position ASC, id ASC')
		.bind(project.id)
		.all<Column>();

	const { results: cards } = await db
		.prepare(
			`SELECT cards.* FROM cards
       INNER JOIN columns ON columns.id = cards.column_id
       WHERE columns.project_id = ? AND cards.archived_at IS NULL
       ORDER BY cards.position ASC, cards.id ASC`
		)
		.bind(project.id)
		.all<Card>();

	const { results: attachments } = await db
		.prepare(
			`SELECT card_attachments.* FROM card_attachments
       INNER JOIN cards ON cards.id = card_attachments.card_id
       INNER JOIN columns ON columns.id = cards.column_id
       WHERE columns.project_id = ?
       ORDER BY card_attachments.created_at ASC, card_attachments.id ASC`
		)
		.bind(project.id)
		.all<CardAttachment>();

	const byCard = new Map<number, CardAttachment[]>();
	for (const attachment of attachments) {
		const list = byCard.get(attachment.card_id) ?? [];
		list.push(attachment);
		byCard.set(attachment.card_id, list);
	}

	const byColumn = new Map<number, Array<Card & { attachments: CardAttachment[] }>>();
	for (const col of columns) byColumn.set(col.id, []);
	for (const card of cards) {
		const list = byColumn.get(card.column_id);
		if (list) list.push({ ...card, attachments: byCard.get(card.id) ?? [] });
	}

	return {
		project,
		columns: columns.map((c) => ({ ...c, cards: byColumn.get(c.id) ?? [] }))
	};
}

export async function getCard(db: D1Database, cardId: number): Promise<CardDetail> {
	const row = await db
		.prepare(
			`SELECT cards.*, columns.name AS column_name, columns.project_id,
              projects.name AS project_name, projects.slug AS project_slug
       FROM cards
       INNER JOIN columns ON columns.id = cards.column_id
       INNER JOIN projects ON projects.id = columns.project_id
       WHERE cards.id = ?`
		)
		.bind(cardId)
		.first<CardWithContext>();
	if (!row) throw new DbError(`card #${cardId} not found`);
	return { ...row, attachments: await listCardAttachments(db, cardId) };
}

export async function listCardAttachments(
	db: D1Database,
	cardId: number
): Promise<CardAttachment[]> {
	const { results } = await db
		.prepare(
			`SELECT * FROM card_attachments
       WHERE card_id = ? ORDER BY created_at ASC, id ASC`
		)
		.bind(cardId)
		.all<CardAttachment>();
	return results;
}

export async function getCardAttachment(
	db: D1Database,
	attachmentId: string
): Promise<CardAttachment> {
	const attachment = await db
		.prepare('SELECT * FROM card_attachments WHERE id = ?')
		.bind(attachmentId)
		.first<CardAttachment>();
	if (!attachment) throw new DbError(`attachment '${attachmentId}' not found`);
	return attachment;
}

export async function createCardAttachment(
	db: D1Database,
	attachment: Omit<CardAttachment, 'created_at'>
): Promise<CardAttachment> {
	const card = await db
		.prepare('SELECT id FROM cards WHERE id = ?')
		.bind(attachment.card_id)
		.first<{ id: number }>();
	if (!card) throw new DbError(`card #${attachment.card_id} not found`);

	await db
		.prepare(
			`INSERT INTO card_attachments
       (id, card_id, object_key, file_name, content_type, byte_size, width, height)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			attachment.id,
			attachment.card_id,
			attachment.object_key,
			attachment.file_name,
			attachment.content_type,
			attachment.byte_size,
			attachment.width,
			attachment.height
		)
		.run();
	return getCardAttachment(db, attachment.id);
}

export async function deleteCardAttachment(
	db: D1Database,
	attachmentId: string
): Promise<void> {
	const attachment = await getCardAttachment(db, attachmentId);
	await db.prepare('DELETE FROM card_attachments WHERE id = ?').bind(attachment.id).run();
}

export async function listCardAttachmentKeys(
	db: D1Database,
	cardId: number
): Promise<string[]> {
	const { results } = await db
		.prepare('SELECT object_key FROM card_attachments WHERE card_id = ?')
		.bind(cardId)
		.all<{ object_key: string }>();
	return results.map((row) => row.object_key);
}

export async function listProjectAttachmentKeys(
	db: D1Database,
	projectRef: string | number
): Promise<string[]> {
	const project = await resolveProject(db, projectRef);
	const { results } = await db
		.prepare(
			`SELECT card_attachments.object_key FROM card_attachments
       INNER JOIN cards ON cards.id = card_attachments.card_id
       INNER JOIN columns ON columns.id = cards.column_id
       WHERE columns.project_id = ?`
		)
		.bind(project.id)
		.all<{ object_key: string }>();
	return results.map((row) => row.object_key);
}

export async function listColumnAttachmentKeys(
	db: D1Database,
	columnId: number
): Promise<string[]> {
	const { results } = await db
		.prepare(
			`SELECT card_attachments.object_key FROM card_attachments
       INNER JOIN cards ON cards.id = card_attachments.card_id
       WHERE cards.column_id = ?`
		)
		.bind(columnId)
		.all<{ object_key: string }>();
	return results.map((row) => row.object_key);
}

async function maxPosition(
	db: D1Database,
	table: 'cards' | 'columns' | 'projects',
	whereSql: string,
	binds: unknown[]
): Promise<number | null> {
	const row = await db
		.prepare(`SELECT MAX(position) AS m FROM ${table} ${whereSql}`)
		.bind(...binds)
		.first<{ m: number | null }>();
	return row?.m ?? null;
}

async function renumberCards(db: D1Database, columnId: number): Promise<void> {
	const { results } = await db
		.prepare(
			`SELECT id FROM cards WHERE column_id = ? AND archived_at IS NULL
       ORDER BY position ASC, id ASC`
		)
		.bind(columnId)
		.all<{ id: number }>();
	const positions = renumberPositions(results.length);
	const stmts: D1PreparedStatement[] = results.map((r, i) =>
		db.prepare('UPDATE cards SET position = ? WHERE id = ?').bind(positions[i], r.id)
	);
	if (stmts.length) await db.batch(stmts);
}

async function renumberColumns(db: D1Database, projectId: number): Promise<void> {
	const { results } = await db
		.prepare('SELECT id FROM columns WHERE project_id = ? ORDER BY position ASC, id ASC')
		.bind(projectId)
		.all<{ id: number }>();
	const positions = renumberPositions(results.length);
	const stmts = results.map((r, i) =>
		db.prepare('UPDATE columns SET position = ? WHERE id = ?').bind(positions[i], r.id)
	);
	if (stmts.length) await db.batch(stmts);
}

async function renumberProjects(db: D1Database): Promise<void> {
	const { results } = await db
		.prepare('SELECT id FROM projects ORDER BY position ASC, id ASC')
		.all<{ id: number }>();
	const positions = renumberPositions(results.length);
	const stmts = results.map((r, i) =>
		db.prepare('UPDATE projects SET position = ? WHERE id = ?').bind(positions[i], r.id)
	);
	if (stmts.length) await db.batch(stmts);
}

/** Compute insert position; if gap exhausted, renumber then recompute. */
async function insertCardPosition(
	db: D1Database,
	columnId: number,
	beforeCardId?: number | null,
	top = false
): Promise<number> {
	const { results } = await db
		.prepare(
			`SELECT id, position FROM cards
       WHERE column_id = ? AND archived_at IS NULL
       ORDER BY position ASC, id ASC`
		)
		.bind(columnId)
		.all<{ id: number; position: number }>();

	let prev: number | null = null;
	let next: number | null = null;

	if (beforeCardId != null) {
		const idx = results.findIndex((c) => c.id === beforeCardId);
		if (idx === -1) {
			throw new DbError(`before_card_id #${beforeCardId} not found in target column`);
		}
		next = results[idx].position;
		prev = idx > 0 ? results[idx - 1].position : null;
	} else if (top) {
		next = results[0]?.position ?? null;
		prev = null;
	} else {
		prev = results.length ? results[results.length - 1].position : null;
		next = null;
	}

	if (needsRenumber(prev, next)) {
		await renumberCards(db, columnId);
		return insertCardPosition(db, columnId, beforeCardId, top);
	}
	return positionBetween(prev, next);
}

export async function createCard(
	db: D1Database,
	opts: {
		project: string | number;
		column: string | number;
		title: string;
		body_md?: string;
		top?: boolean;
	}
): Promise<Card> {
	const title = opts.title.trim();
	if (!title) throw new DbError('title is required');
	const col = await resolveColumn(db, opts.project, opts.column);
	const position = await insertCardPosition(db, col.id, null, opts.top === true);
	const result = await db
		.prepare(
			`INSERT INTO cards (column_id, title, body_md, position)
       VALUES (?, ?, ?, ?)`
		)
		.bind(col.id, title, opts.body_md ?? '', position)
		.run();
	const id = result.meta.last_row_id;
	const card = await db.prepare('SELECT * FROM cards WHERE id = ?').bind(id).first<Card>();
	if (!card) throw new DbError('failed to create card');
	return card;
}

export async function updateCard(
	db: D1Database,
	cardId: number,
	patch: { title?: string; body_md?: string }
): Promise<Card> {
	const existing = await db
		.prepare('SELECT * FROM cards WHERE id = ?')
		.bind(cardId)
		.first<Card>();
	if (!existing) throw new DbError(`card #${cardId} not found`);

	const title = patch.title !== undefined ? patch.title.trim() : existing.title;
	if (!title) throw new DbError('title is required');
	const body_md = patch.body_md !== undefined ? patch.body_md : existing.body_md;

	await db
		.prepare(
			`UPDATE cards SET title = ?, body_md = ?, updated_at = datetime('now') WHERE id = ?`
		)
		.bind(title, body_md, cardId)
		.run();

	const card = await db.prepare('SELECT * FROM cards WHERE id = ?').bind(cardId).first<Card>();
	if (!card) throw new DbError(`card #${cardId} not found`);
	return card;
}

export async function moveCard(
	db: D1Database,
	cardId: number,
	opts: {
		column: string | number;
		/** Project scope for name-based column resolve; optional if column is id. */
		project?: string | number;
		before_card_id?: number | null;
	}
): Promise<Card> {
	const existing = await db
		.prepare('SELECT * FROM cards WHERE id = ?')
		.bind(cardId)
		.first<Card>();
	if (!existing) throw new DbError(`card #${cardId} not found`);

	let targetCol: Column;
	if (typeof opts.column === 'number' || /^\d+$/.test(String(opts.column))) {
		const col = await db
			.prepare('SELECT * FROM columns WHERE id = ?')
			.bind(Number(opts.column))
			.first<Column>();
		if (!col) throw new DbError(`column '${opts.column}' not found`);
		targetCol = col;
	} else {
		let projectRef = opts.project;
		if (projectRef == null) {
			const ctx = await getCard(db, cardId);
			projectRef = ctx.project_id;
		}
		targetCol = await resolveColumn(db, projectRef, opts.column);
	}

	const position = await insertCardPosition(
		db,
		targetCol.id,
		opts.before_card_id ?? null,
		false
	);

	await db
		.prepare(
			`UPDATE cards SET column_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?`
		)
		.bind(targetCol.id, position, cardId)
		.run();

	const card = await db.prepare('SELECT * FROM cards WHERE id = ?').bind(cardId).first<Card>();
	if (!card) throw new DbError(`card #${cardId} not found`);
	return card;
}

export async function archiveCard(db: D1Database, cardId: number): Promise<Card> {
	const existing = await db
		.prepare('SELECT * FROM cards WHERE id = ?')
		.bind(cardId)
		.first<Card>();
	if (!existing) throw new DbError(`card #${cardId} not found`);
	await db
		.prepare(
			`UPDATE cards SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
		)
		.bind(cardId)
		.run();
	const card = await db.prepare('SELECT * FROM cards WHERE id = ?').bind(cardId).first<Card>();
	if (!card) throw new DbError(`card #${cardId} not found`);
	return card;
}

export async function restoreCard(db: D1Database, cardId: number): Promise<Card> {
	const existing = await db
		.prepare('SELECT * FROM cards WHERE id = ?')
		.bind(cardId)
		.first<Card>();
	if (!existing) throw new DbError(`card #${cardId} not found`);
	if (!existing.archived_at) throw new DbError(`card #${cardId} is not archived`);

	// Append to end of its column among non-archived cards
	const max = await maxPosition(db, 'cards', 'WHERE column_id = ? AND archived_at IS NULL', [
		existing.column_id
	]);
	const position = positionBetween(max, null);

	await db
		.prepare(
			`UPDATE cards SET archived_at = NULL, position = ?, updated_at = datetime('now') WHERE id = ?`
		)
		.bind(position, cardId)
		.run();
	const card = await db.prepare('SELECT * FROM cards WHERE id = ?').bind(cardId).first<Card>();
	if (!card) throw new DbError(`card #${cardId} not found`);
	return card;
}

export async function deleteCardPermanently(db: D1Database, cardId: number): Promise<void> {
	const existing = await db
		.prepare('SELECT id FROM cards WHERE id = ?')
		.bind(cardId)
		.first<{ id: number }>();
	if (!existing) throw new DbError(`card #${cardId} not found`);
	await db.prepare('DELETE FROM cards WHERE id = ?').bind(cardId).run();
}

export async function listArchived(
	db: D1Database,
	projectRef?: string | number
): Promise<CardWithContext[]> {
	if (projectRef != null) {
		const project = await resolveProject(db, projectRef);
		const { results } = await db
			.prepare(
				`SELECT cards.*, columns.name AS column_name, columns.project_id,
                projects.name AS project_name, projects.slug AS project_slug
         FROM cards
         INNER JOIN columns ON columns.id = cards.column_id
         INNER JOIN projects ON projects.id = columns.project_id
         WHERE projects.id = ? AND cards.archived_at IS NOT NULL
         ORDER BY cards.archived_at DESC`
			)
			.bind(project.id)
			.all<CardWithContext>();
		return results;
	}
	const { results } = await db
		.prepare(
			`SELECT cards.*, columns.name AS column_name, columns.project_id,
              projects.name AS project_name, projects.slug AS project_slug
       FROM cards
       INNER JOIN columns ON columns.id = cards.column_id
       INNER JOIN projects ON projects.id = columns.project_id
       WHERE cards.archived_at IS NOT NULL
       ORDER BY cards.archived_at DESC`
		)
		.all<CardWithContext>();
	return results;
}

export async function createColumn(
	db: D1Database,
	projectRef: string | number,
	name: string
): Promise<Column> {
	const n = name.trim();
	if (!n) throw new DbError('column name is required');
	const project = await resolveProject(db, projectRef);
	const max = await maxPosition(db, 'columns', 'WHERE project_id = ?', [project.id]);
	const position = positionBetween(max, null);
	const result = await db
		.prepare('INSERT INTO columns (project_id, name, position) VALUES (?, ?, ?)')
		.bind(project.id, n, position)
		.run();
	const col = await db
		.prepare('SELECT * FROM columns WHERE id = ?')
		.bind(result.meta.last_row_id)
		.first<Column>();
	if (!col) throw new DbError('failed to create column');
	return col;
}

export async function renameColumn(
	db: D1Database,
	columnId: number,
	name: string
): Promise<Column> {
	const n = name.trim();
	if (!n) throw new DbError('column name is required');
	const existing = await db
		.prepare('SELECT * FROM columns WHERE id = ?')
		.bind(columnId)
		.first<Column>();
	if (!existing) throw new DbError(`column #${columnId} not found`);
	await db.prepare('UPDATE columns SET name = ? WHERE id = ?').bind(n, columnId).run();
	const col = await db
		.prepare('SELECT * FROM columns WHERE id = ?')
		.bind(columnId)
		.first<Column>();
	if (!col) throw new DbError(`column #${columnId} not found`);
	return col;
}

export async function deleteColumn(db: D1Database, columnId: number): Promise<void> {
	const existing = await db
		.prepare('SELECT * FROM columns WHERE id = ?')
		.bind(columnId)
		.first<Column>();
	if (!existing) throw new DbError(`column #${columnId} not found`);
	const count = await db
		.prepare(
			`SELECT COUNT(*) AS c FROM cards WHERE column_id = ? AND archived_at IS NULL`
		)
		.bind(columnId)
		.first<{ c: number }>();
	if ((count?.c ?? 0) > 0) {
		throw new DbError(
			`column '${existing.name}' is not empty — move or archive cards first`
		);
	}
	// Soft-archived cards in this column: hard-delete them with the column
	await db.prepare('DELETE FROM cards WHERE column_id = ?').bind(columnId).run();
	await db.prepare('DELETE FROM columns WHERE id = ?').bind(columnId).run();
}

export async function reorderColumn(
	db: D1Database,
	columnId: number,
	beforeColumnId?: number | null
): Promise<Column> {
	const existing = await db
		.prepare('SELECT * FROM columns WHERE id = ?')
		.bind(columnId)
		.first<Column>();
	if (!existing) throw new DbError(`column #${columnId} not found`);

	const { results } = await db
		.prepare(
			`SELECT id, position FROM columns WHERE project_id = ? AND id != ?
       ORDER BY position ASC, id ASC`
		)
		.bind(existing.project_id, columnId)
		.all<{ id: number; position: number }>();

	let prev: number | null = null;
	let next: number | null = null;
	if (beforeColumnId != null) {
		const idx = results.findIndex((c) => c.id === beforeColumnId);
		if (idx === -1) throw new DbError(`before column #${beforeColumnId} not found`);
		next = results[idx].position;
		prev = idx > 0 ? results[idx - 1].position : null;
	} else {
		prev = results.length ? results[results.length - 1].position : null;
	}

	if (needsRenumber(prev, next)) {
		await renumberColumns(db, existing.project_id);
		return reorderColumn(db, columnId, beforeColumnId);
	}

	const position = positionBetween(prev, next);
	await db
		.prepare('UPDATE columns SET position = ? WHERE id = ?')
		.bind(position, columnId)
		.run();
	const col = await db
		.prepare('SELECT * FROM columns WHERE id = ?')
		.bind(columnId)
		.first<Column>();
	if (!col) throw new DbError(`column #${columnId} not found`);
	return col;
}

export async function createProject(db: D1Database, name: string): Promise<Project> {
	const n = name.trim();
	if (!n) throw new DbError('project name is required');
	const slug = await uniqueSlug(db, n);
	const max = await maxPosition(db, 'projects', '', []);
	const position = positionBetween(max, null);
	const result = await db
		.prepare(
			`INSERT INTO projects (name, slug, is_default, position) VALUES (?, ?, 0, ?)`
		)
		.bind(n, slug, position)
		.run();
	const projectId = result.meta.last_row_id;
	await db.batch([
		db
			.prepare('INSERT INTO columns (project_id, name, position) VALUES (?, ?, ?)')
			.bind(projectId, 'Todo', 1.0),
		db
			.prepare('INSERT INTO columns (project_id, name, position) VALUES (?, ?, ?)')
			.bind(projectId, 'Doing', 2.0),
		db
			.prepare('INSERT INTO columns (project_id, name, position) VALUES (?, ?, ?)')
			.bind(projectId, 'Done', 3.0)
	]);
	const project = await db
		.prepare('SELECT * FROM projects WHERE id = ?')
		.bind(projectId)
		.first<Project>();
	if (!project) throw new DbError('failed to create project');
	return project;
}

export async function renameProject(
	db: D1Database,
	projectRef: string | number,
	name: string
): Promise<Project> {
	const n = name.trim();
	if (!n) throw new DbError('project name is required');
	const project = await resolveProject(db, projectRef);
	await db.prepare('UPDATE projects SET name = ? WHERE id = ?').bind(n, project.id).run();
	const updated = await db
		.prepare('SELECT * FROM projects WHERE id = ?')
		.bind(project.id)
		.first<Project>();
	if (!updated) throw new DbError(`project #${project.id} not found`);
	return updated;
}

export async function reorderProject(
	db: D1Database,
	projectId: number,
	beforeProjectId?: number | null
): Promise<Project> {
	const existing = await db
		.prepare('SELECT * FROM projects WHERE id = ?')
		.bind(projectId)
		.first<Project>();
	if (!existing) throw new DbError(`project #${projectId} not found`);

	const { results } = await db
		.prepare(
			`SELECT id, position FROM projects WHERE id != ?
       ORDER BY position ASC, id ASC`
		)
		.bind(projectId)
		.all<{ id: number; position: number }>();

	let prev: number | null = null;
	let next: number | null = null;
	if (beforeProjectId != null) {
		const index = results.findIndex((project) => project.id === beforeProjectId);
		if (index === -1) throw new DbError(`before project #${beforeProjectId} not found`);
		next = results[index].position;
		prev = index > 0 ? results[index - 1].position : null;
	} else {
		prev = results.at(-1)?.position ?? null;
	}

	if (needsRenumber(prev, next)) {
		await renumberProjects(db);
		return reorderProject(db, projectId, beforeProjectId);
	}

	await db
		.prepare('UPDATE projects SET position = ? WHERE id = ?')
		.bind(positionBetween(prev, next), projectId)
		.run();
	const updated = await db
		.prepare('SELECT * FROM projects WHERE id = ?')
		.bind(projectId)
		.first<Project>();
	if (!updated) throw new DbError(`project #${projectId} not found`);
	return updated;
}

export async function deleteProject(
	db: D1Database,
	projectRef: string | number
): Promise<void> {
	const project = await resolveProject(db, projectRef);
	const projects = await listProjects(db);
	if (projects.length <= 1) throw new DbError('the last board cannot be deleted');
	const replacement = projects.find((candidate) => candidate.id !== project.id);
	if (!replacement) throw new DbError('no replacement board found');

	const statements: D1PreparedStatement[] = [
		db
			.prepare(
				`DELETE FROM cards WHERE column_id IN (SELECT id FROM columns WHERE project_id = ?)`
			)
			.bind(project.id),
		db.prepare('DELETE FROM columns WHERE project_id = ?').bind(project.id),
		db.prepare('DELETE FROM projects WHERE id = ?').bind(project.id)
	];
	if (project.is_default) {
		statements.push(
			db.prepare('UPDATE projects SET is_default = 1 WHERE id = ?').bind(replacement.id)
		);
	}
	await db.batch(statements);
}

export async function getDefaultProject(db: D1Database): Promise<Project> {
	const row = await db
		.prepare('SELECT * FROM projects WHERE is_default = 1 ORDER BY id ASC LIMIT 1')
		.first<Project>();
	if (row) return row;
	const first = await db
		.prepare('SELECT * FROM projects ORDER BY position ASC, id ASC LIMIT 1')
		.first<Project>();
	if (!first) throw new DbError('no projects exist');
	return first;
}

// Re-export renumber helpers used by tests / advanced callers
export { renumberCards, renumberColumns, renumberProjects };
