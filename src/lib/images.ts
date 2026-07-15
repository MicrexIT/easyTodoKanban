const MAX_SOURCE_BYTES = 15_000_000;
const MAX_EDGE = 1600;
const TARGET_BYTES = 1_500_000;

export type PreparedImage = {
	file: File;
	width: number;
	height: number;
};

function loadImage(file: File): Promise<{ image: HTMLImageElement; url: string }> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.onload = () => resolve({ image, url });
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error(`Could not read ${file.name}`));
		};
		image.src = url;
	});
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('This browser could not compress the image'))),
			'image/webp',
			quality
		);
	});
}

export async function prepareImage(file: File): Promise<PreparedImage> {
	if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image`);
	if (file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name} is larger than 15 MB`);

	const { image, url } = await loadImage(file);
	try {
		const sourceWidth = image.naturalWidth;
		const sourceHeight = image.naturalHeight;
		if (!sourceWidth || !sourceHeight) throw new Error(`${file.name} has invalid dimensions`);

		let scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
		let quality = 0.82;
		let blob: Blob | null = null;
		let width = 0;
		let height = 0;

		for (let attempt = 0; attempt < 5; attempt += 1) {
			width = Math.max(1, Math.round(sourceWidth * scale));
			height = Math.max(1, Math.round(sourceHeight * scale));
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Canvas image processing is unavailable');
			context.drawImage(image, 0, 0, width, height);
			blob = await canvasBlob(canvas, quality);
			if (blob.type !== 'image/webp') throw new Error('This browser cannot create WebP images');
			if (blob.size <= TARGET_BYTES) break;
			if (quality > 0.64) quality -= 0.1;
			else scale *= 0.8;
		}

		if (!blob || blob.size > 2_500_000) {
			throw new Error(`${file.name} could not be compressed below 2.5 MB`);
		}
		const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 140) || 'image';
		return {
			file: new File([blob], `${baseName}.webp`, { type: 'image/webp' }),
			width,
			height
		};
	} finally {
		URL.revokeObjectURL(url);
	}
}
