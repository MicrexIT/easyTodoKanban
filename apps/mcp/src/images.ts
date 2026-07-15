export const MAX_IMAGE_BYTES = 2_500_000;
export const MAX_BASE64_INPUT_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 256;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type SupportedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export type PreparedImage = {
	bytes: Uint8Array;
	contentType: SupportedImageType;
	fileName: string;
	width: number;
	height: number;
};

export class ImageInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ImageInputError';
	}
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
	let value = '';
	for (let index = start; index < start + length && index < bytes.length; index += 1) {
		value += String.fromCharCode(bytes[index]);
	}
	return value;
}

function uint24le(bytes: Uint8Array, offset: number): number {
	return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function inspectPng(bytes: Uint8Array): PreparedImageInfo | null {
	if (
		bytes.length < 33 ||
		ascii(bytes, 0, 8) !== '\x89PNG\r\n\x1a\n' ||
		ascii(bytes, 12, 4) !== 'IHDR' ||
		new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8) !== 13 ||
		new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.length - 12) !==
			0 ||
		ascii(bytes, bytes.length - 8, 4) !== 'IEND'
	) {
		return null;
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return { contentType: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
}

function inspectJpeg(bytes: Uint8Array): PreparedImageInfo | null {
	if (
		bytes.length < 4 ||
		bytes[0] !== 0xff ||
		bytes[1] !== 0xd8 ||
		bytes.at(-2) !== 0xff ||
		bytes.at(-1) !== 0xd9
	)
		return null;
	const startOfFrame = new Set([
		0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
	]);
	let offset = 2;
	while (offset + 3 < bytes.length) {
		if (bytes[offset] !== 0xff) {
			offset += 1;
			continue;
		}
		while (bytes[offset] === 0xff) offset += 1;
		const marker = bytes[offset];
		offset += 1;
		if (marker === 0xd8 || marker === 0xd9) continue;
		if (offset + 1 >= bytes.length) break;
		const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
		if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
		if (startOfFrame.has(marker) && segmentLength >= 7) {
			return {
				contentType: 'image/jpeg',
				height: (bytes[offset + 3] << 8) | bytes[offset + 4],
				width: (bytes[offset + 5] << 8) | bytes[offset + 6]
			};
		}
		offset += segmentLength;
	}
	return null;
}

function inspectWebp(bytes: Uint8Array): PreparedImageInfo | null {
	if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
		return null;
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(4, true) + 8 !== bytes.length) return null;
	const chunk = ascii(bytes, 12, 4);
	if (chunk === 'VP8X') {
		return {
			contentType: 'image/webp',
			width: uint24le(bytes, 24) + 1,
			height: uint24le(bytes, 27) + 1
		};
	}
	if (chunk === 'VP8L' && bytes[20] === 0x2f) {
		return {
			contentType: 'image/webp',
			width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]),
			height: 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | (bytes[22] >> 6))
		};
	}
	if (
		chunk === 'VP8 ' &&
		bytes[23] === 0x9d &&
		bytes[24] === 0x01 &&
		bytes[25] === 0x2a
	) {
		return {
			contentType: 'image/webp',
			width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
			height: (bytes[28] | (bytes[29] << 8)) & 0x3fff
		};
	}
	return null;
}

type PreparedImageInfo = {
	contentType: SupportedImageType;
	width: number;
	height: number;
};

export function inspectImage(bytes: Uint8Array): PreparedImageInfo {
	const info = inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes);
	if (!info || info.width < 1 || info.height < 1 || info.width > 8192 || info.height > 8192) {
		throw new ImageInputError('Image must be a valid JPEG, PNG, or WebP up to 8192 × 8192.');
	}
	return info;
}

function safeFileName(name: string, contentType: SupportedImageType): string {
	const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
	const cleaned = name
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.replace(/[\\/]/g, '-')
		.trim()
		.slice(0, 150);
	const baseName = cleaned.replace(/\.[a-z0-9]{1,8}$/i, '') || 'image';
	return `${baseName}.${extension}`;
}

function validateRemoteUrl(value: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new ImageInputError('image_url must be a valid HTTPS URL.');
	}
	if (url.protocol !== 'https:' || url.username || url.password) {
		throw new ImageInputError('image_url must be an HTTPS URL without embedded credentials.');
	}

	const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
	const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
	const privateIpv4 =
		ipv4 &&
		(Number(ipv4[1]) === 10 ||
			Number(ipv4[1]) === 127 ||
			(Number(ipv4[1]) === 169 && Number(ipv4[2]) === 254) ||
			(Number(ipv4[1]) === 172 && Number(ipv4[2]) >= 16 && Number(ipv4[2]) <= 31) ||
			(Number(ipv4[1]) === 192 && Number(ipv4[2]) === 168));
	const privateIpv6 =
		hostname.includes(':') &&
		(hostname === '::' ||
			hostname === '::1' ||
			hostname.startsWith('fc') ||
			hostname.startsWith('fd') ||
			/^fe[89ab]/.test(hostname));
	if (
		hostname === 'localhost' ||
		hostname.endsWith('.localhost') ||
		hostname.endsWith('.local') ||
		hostname.endsWith('.internal') ||
		privateIpv4 ||
		privateIpv6
	) {
		throw new ImageInputError('image_url must point to a public host.');
	}
	return url;
}

async function readLimitedStream(
	stream: ReadableStream<Uint8Array> | null,
	maximumBytes: number
): Promise<Uint8Array> {
	if (!stream) throw new ImageInputError('Image response had no body.');
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maximumBytes) {
				await reader.cancel('image too large');
				throw new ImageInputError('Image must be smaller than 2.5 MB.');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

async function fetchRemoteImage(
	input: string
): Promise<{ bytes: Uint8Array; declaredType?: string; suggestedName?: string }> {
	let url = validateRemoteUrl(input);
	for (let redirect = 0; redirect <= 3; redirect += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15_000);
		try {
			const response = await fetch(url, {
				redirect: 'manual',
				headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
				signal: controller.signal
			});

			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get('location');
				await response.body?.cancel();
				if (!location || redirect === 3) {
					throw new ImageInputError('Too many image URL redirects.');
				}
				url = validateRemoteUrl(new URL(location, url).toString());
				continue;
			}
			if (!response.ok) {
				await response.body?.cancel();
				throw new ImageInputError(`Image download failed with HTTP ${response.status}.`);
			}
			const contentLength = Number(response.headers.get('content-length'));
			if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
				await response.body?.cancel();
				throw new ImageInputError('Image must be smaller than 2.5 MB.');
			}
			let suggestedName: string | undefined;
			try {
				suggestedName = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
			} catch {
				suggestedName = undefined;
			}
			return {
				bytes: await readLimitedStream(response.body, MAX_IMAGE_BYTES),
				declaredType: response.headers.get('content-type')?.split(';')[0].trim().toLowerCase(),
				suggestedName
			};
		} catch (cause) {
			if (cause instanceof ImageInputError) throw cause;
			throw new ImageInputError(
				cause instanceof Error && cause.name === 'AbortError'
					? 'Image download timed out.'
					: 'Could not download image_url.'
			);
		} finally {
			clearTimeout(timeout);
		}
	}
	throw new ImageInputError('Could not download image_url.');
}

function decodeBase64Image(
	input: string,
	mimeType?: string
): { bytes: Uint8Array; declaredType?: string } {
	const dataUrl = /^data:(image\/(?:jpeg|png|webp));base64,(.*)$/is.exec(input);
	const payload = (dataUrl?.[2] ?? input).replace(/\s/g, '');
	const declaredType = dataUrl?.[1].toLowerCase() ?? mimeType;
	if (payload.length > MAX_BASE64_INPUT_CHARS) {
		throw new ImageInputError('Base64 image must decode to less than 2.5 MB.');
	}
	if (payload.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
		throw new ImageInputError('image_base64 is not valid base64 data.');
	}
	let binary: string;
	try {
		binary = atob(payload);
	} catch {
		throw new ImageInputError('image_base64 is not valid base64 data.');
	}
	if (binary.length > MAX_IMAGE_BYTES) {
		throw new ImageInputError('Image must be smaller than 2.5 MB.');
	}
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return { bytes, declaredType };
}

export async function prepareImageInput(input: {
	imageUrl?: string;
	imageBase64?: string;
	mimeType?: string;
	fileName?: string;
}): Promise<PreparedImage> {
	if (Boolean(input.imageUrl) === Boolean(input.imageBase64)) {
		throw new ImageInputError('Provide exactly one of image_url or image_base64.');
	}
	const source: { bytes: Uint8Array; declaredType?: string; suggestedName?: string } = input.imageUrl
		? await fetchRemoteImage(input.imageUrl)
		: decodeBase64Image(input.imageBase64!, input.mimeType);
	const info = inspectImage(source.bytes);
	if (
		source.declaredType &&
		ALLOWED_IMAGE_TYPES.has(source.declaredType) &&
		source.declaredType !== info.contentType
	) {
		throw new ImageInputError('Declared MIME type does not match the image contents.');
	}
	return {
		bytes: source.bytes,
		contentType: info.contentType,
		fileName: safeFileName(input.fileName ?? source.suggestedName ?? '', info.contentType),
		width: info.width,
		height: info.height
	};
}

export function bytesToBase64(bytes: Uint8Array): string {
	const chunks: string[] = [];
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
	}
	return btoa(chunks.join(''));
}
