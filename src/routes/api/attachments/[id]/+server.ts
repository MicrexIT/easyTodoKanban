import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DbError, deleteCardAttachment, getCardAttachment } from '@easytodo/db';
import { getDb } from '$lib/server/db';
import { getMediaBucket } from '$lib/server/media';

export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	const bucket = getMediaBucket(event);
	let attachment;
	try {
		attachment = await getCardAttachment(db, event.params.id);
	} catch (cause) {
		if (cause instanceof DbError) error(404, cause.message);
		throw cause;
	}

	const object = await bucket!.get(attachment.object_key);
	if (!object) error(404, 'image file not found');
	if (event.request.headers.get('if-none-match') === object.httpEtag) {
		return new Response(null, { status: 304, headers: { ETag: object.httpEtag } });
	}
	const headers = new Headers();
	headers.set('Content-Type', attachment.content_type);
	headers.set('Content-Length', String(object.size));
	headers.set('Cache-Control', 'private, max-age=86400');
	headers.set('ETag', object.httpEtag);
	headers.set('X-Content-Type-Options', 'nosniff');
	return new Response(object.body, { headers });
};

export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	const bucket = getMediaBucket(event);
	try {
		const attachment = await getCardAttachment(db, event.params.id);
		await bucket!.delete(attachment.object_key);
		await deleteCardAttachment(db, attachment.id);
		return json({ ok: true });
	} catch (cause) {
		if (cause instanceof DbError) error(404, cause.message);
		throw cause;
	}
};
