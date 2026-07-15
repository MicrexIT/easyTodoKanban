import { error } from '@sveltejs/kit';

type MediaBucket = App.Platform['env']['MEDIA'];

export function getMediaBucket(
	event: { platform?: App.Platform },
	required = true
): MediaBucket | undefined {
	const bucket = event.platform?.env?.MEDIA;
	if (!bucket && required) {
		error(
			503,
			'Media storage is not configured. Create the R2 bucket and add the MEDIA binding.'
		);
	}
	return bucket;
}

export async function deleteMediaObjects(
	bucket: MediaBucket | undefined,
	keys: string[]
): Promise<void> {
	if (keys.length === 0) return;
	if (!bucket) {
		error(503, 'Media storage is not configured; refusing to leave image files orphaned.');
	}
	for (let index = 0; index < keys.length; index += 1000) {
		await bucket.delete(keys.slice(index, index + 1000));
	}
}
