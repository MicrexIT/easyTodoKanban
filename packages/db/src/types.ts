export type Project = {
	id: number;
	name: string;
	slug: string;
	is_default: number;
	position: number;
	created_at: string;
};

export type Column = {
	id: number;
	project_id: number;
	name: string;
	position: number;
};

export type Card = {
	id: number;
	column_id: number;
	title: string;
	body_md: string;
	position: number;
	archived_at: string | null;
	created_at: string;
	updated_at: string;
};

export type CardAttachment = {
	id: string;
	card_id: number;
	object_key: string;
	file_name: string;
	content_type: string;
	byte_size: number;
	width: number;
	height: number;
	created_at: string;
};

export type CardWithAttachments = Card & {
	attachments: CardAttachment[];
};

export type BoardColumn = Column & {
	cards: CardWithAttachments[];
};

export type Board = {
	project: Project;
	columns: BoardColumn[];
};

export type CardWithContext = Card & {
	column_name: string;
	project_id: number;
	project_name: string;
	project_slug: string;
};

export type CardDetail = CardWithContext & {
	attachments: CardAttachment[];
};

/** Minimal D1 surface used by this package (works with real D1 and tests). */
export type D1PreparedStatement = {
	bind(...values: unknown[]): D1PreparedStatement;
	first<T = unknown>(colName?: string): Promise<T | null>;
	all<T = unknown>(): Promise<{ results: T[] }>;
	run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
};

export type D1Database = {
	prepare(query: string): D1PreparedStatement;
	batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
	exec(query: string): Promise<unknown>;
};

export class DbError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DbError';
	}
}
