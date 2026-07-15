<script lang="ts">
	import type { CardAttachment } from '@easytodo/db';
	import { prepareImage } from '$lib/images';

	interface Props {
		cardId: number;
		attachments: CardAttachment[];
		compact?: boolean;
	}

	let { cardId, attachments, compact = false }: Props = $props();
	let localAttachments = $state<CardAttachment[]>([]);
	let uploading = $state(false);
	let message = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	$effect(() => {
		localAttachments = attachments.map((attachment) => ({ ...attachment }));
	});

	async function upload(files: FileList | null) {
		if (!files?.length || uploading) return;
		uploading = true;
		message = '';
		try {
			for (const file of Array.from(files)) {
				message = `optimizing ${file.name}…`;
				const prepared = await prepareImage(file);
				const data = new FormData();
				data.set('image', prepared.file);
				data.set('width', String(prepared.width));
				data.set('height', String(prepared.height));
				message = `uploading ${file.name}…`;
				const response = await fetch(`/api/cards/${cardId}/attachments`, {
					method: 'POST',
					body: data
				});
				if (!response.ok) throw new Error((await response.text()) || 'upload failed');
				const attachment = (await response.json()) as CardAttachment;
				localAttachments = [...localAttachments, attachment];
			}
			message = `${files.length} image${files.length === 1 ? '' : 's'} added`;
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'upload failed';
		} finally {
			uploading = false;
			if (fileInput) fileInput.value = '';
		}
	}

	async function remove(attachment: CardAttachment) {
		if (!confirm(`remove "${attachment.file_name}"?`)) return;
		const response = await fetch(`/api/attachments/${attachment.id}`, { method: 'DELETE' });
		if (!response.ok) {
			message = (await response.text()) || 'delete failed';
			return;
		}
		localAttachments = localAttachments.filter((item) => item.id !== attachment.id);
		message = 'image removed';
	}
</script>

<section class:compact class="attachments" aria-label="Card images">
	{#if localAttachments.length > 0}
		<div class="attachment-grid">
			{#each localAttachments as attachment (attachment.id)}
				<figure class="attachment">
					<a href="/api/attachments/{attachment.id}" target="_blank" rel="noreferrer">
						<img
							src="/api/attachments/{attachment.id}"
							alt={attachment.file_name}
							width={attachment.width}
							height={attachment.height}
							loading="lazy"
						/>
					</a>
					<button
						type="button"
						class="attachment-remove"
						title="Remove image"
						aria-label="Remove {attachment.file_name}"
						onclick={() => remove(attachment)}>×</button
					>
				</figure>
			{/each}
		</div>
	{/if}
	<div class="attachment-tools">
		<label class="btn attachment-add" aria-disabled={uploading}>
			{uploading ? 'working…' : '＋ add pictures'}
			<input
				bind:this={fileInput}
				type="file"
				accept="image/jpeg,image/png,image/webp"
				multiple
				disabled={uploading}
				onchange={(event) => upload(event.currentTarget.files)}
			/>
		</label>
		{#if message}<span class="attachment-message" role="status">{message}</span>{/if}
	</div>
</section>
