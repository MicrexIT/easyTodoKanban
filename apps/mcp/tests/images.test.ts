import { describe, expect, it } from 'vitest';
import {
	bytesToBase64,
	ImageInputError,
	inspectImage,
	prepareImageInput
} from '../src/images';

function png(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(45);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width);
	view.setUint32(20, height);
	bytes.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0], 33);
	return bytes;
}

describe('inspectImage', () => {
	it('reads PNG dimensions', () => {
		expect(inspectImage(png(640, 360))).toEqual({
			contentType: 'image/png',
			width: 640,
			height: 360
		});
	});

	it('rejects unsupported bytes and oversized dimensions', () => {
		expect(() => inspectImage(new Uint8Array([1, 2, 3]))).toThrow(ImageInputError);
		expect(() => inspectImage(png(9000, 1))).toThrow(/8192/);
	});
});

describe('prepareImageInput', () => {
	it('accepts base64 and normalizes the filename extension', async () => {
		const bytes = png(320, 180);
		const result = await prepareImageInput({
			imageBase64: bytesToBase64(bytes),
			mimeType: 'image/png',
			fileName: 'muse-shot.exe'
		});
		expect(result.contentType).toBe('image/png');
		expect(result.fileName).toBe('muse-shot.png');
		expect(result.bytes).toEqual(bytes);
	});

	it('requires exactly one source and checks declared MIME type', async () => {
		await expect(prepareImageInput({})).rejects.toThrow(/exactly one/);
		await expect(
			prepareImageInput({
				imageBase64: bytesToBase64(png(1, 1)),
				mimeType: 'image/jpeg'
			})
		).rejects.toThrow(/does not match/);
	});
});
