import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCardAttachment, DbError, getCard } from '@easytodo/db';
import { getDb } from '$lib/server/db';
import { getMediaBucket } from '$lib/server/media';

const MAX_IMAGE_BYTES = 2_500_000;
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function detectedImageType(bytes: Uint8Array): string | null {
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
	if (
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47
	)
		return 'image/png';
	if (
		String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
		String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
	)
		return 'image/webp';
	return null;
}

function safeFileName(name: string): string {
	return name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) || 'image';
}

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	const bucket = getMediaBucket(event);
	const cardId = Number(event.params.id);
	if (!Number.isInteger(cardId) || cardId < 1) error(400, 'invalid card id');
	const contentLength = Number(event.request.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > 3_000_000) {
		error(413, 'upload request is too large');
	}

	const data = await event.request.formData();
	const file = data.get('image');
	if (!(file instanceof File)) error(400, 'image is required');
	if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
		error(413, 'image must be smaller than 2.5 MB after compression');
	}
	if (!ALLOWED_CONTENT_TYPES.has(file.type)) error(415, 'JPEG, PNG, or WebP images only');

	const bytes = new Uint8Array(await file.arrayBuffer());
	const contentType = detectedImageType(bytes);
	if (!contentType || contentType !== file.type) error(415, 'file contents do not match its image type');

	const width = Number(data.get('width'));
	const height = Number(data.get('height'));
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width < 1 ||
		height < 1 ||
		width > 8192 ||
		height > 8192
	) {
		error(400, 'invalid image dimensions');
	}

	try {
		await getCard(db, cardId);
	} catch (cause) {
		if (cause instanceof DbError) error(404, cause.message);
		throw cause;
	}

	const id = crypto.randomUUID();
	const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
	const objectKey = `cards/${cardId}/${id}.${extension}`;
	await bucket!.put(objectKey, bytes, {
		httpMetadata: {
			contentType,
			cacheControl: 'private, max-age=86400'
		}
	});

	try {
		const attachment = await createCardAttachment(db, {
			id,
			card_id: cardId,
			object_key: objectKey,
			file_name: safeFileName(file.name),
			content_type: contentType,
			byte_size: file.size,
			width,
			height
		});
		return json(attachment, { status: 201 });
	} catch (cause) {
		await bucket!.delete(objectKey);
		if (cause instanceof DbError) error(400, cause.message);
		throw cause;
	}
};
