<script lang="ts">
	import type { CardWithAttachments as CardType, Project } from '@easytodo/db';
	import { renderMarkdown, relativeTime } from '$lib/markdown';
	import { enhance } from '$app/forms';
	import AttachmentGallery from './AttachmentGallery.svelte';

	interface Props {
		open: boolean;
		card: CardType | null;
		project: Project;
		columnName: string;
		onClose: () => void;
	}

	let { open, card, project, columnName, onClose }: Props = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	let title = $state('');
	let body = $state('');
	let tab = $state<'write' | 'preview'>('write');
	let cardId = $state<number | null>(null);

	$effect(() => {
		if (open && card) {
			title = card.title;
			body = card.body_md;
			cardId = card.id;
			tab = 'write';
			queueMicrotask(() => dialogEl?.showModal());
		} else if (!open) {
			dialogEl?.close();
		}
	});

	const previewHtml = $derived(renderMarkdown(body));
	const meta = $derived(
		card
			? `created ${card.created_at.slice(0, 10)} · updated ${relativeTime(card.updated_at)}`
			: ''
	);

	function onDialogClose() {
		onClose();
	}

	function onDialogCancel(event: Event) {
		// Make Escape follow the same close path as the visible close button.
		event.preventDefault();
		dialogEl?.close();
	}
</script>

<dialog class="card-modal" bind:this={dialogEl} onclose={onDialogClose} oncancel={onDialogCancel}>
	{#if card && cardId != null}
		<header class="modal-head">
			<span class="path"
				><b>{project.slug} / {columnName.toLowerCase()}</b> · #{cardId}</span
			>
			<a class="modal-open-full" href="/c/{cardId}" title="Open full view">open ⤢</a>
			<button type="button" class="modal-close" title="Close" onclick={() => dialogEl?.close()}
				>×</button
			>
		</header>

		<form
			method="POST"
			action="?/updateCard"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success') onClose();
				};
			}}
		>
			<input type="hidden" name="cardId" value={cardId} />
			<div class="modal-body">
				<input class="title-input" name="title" bind:value={title} required />
				<AttachmentGallery cardId={cardId} attachments={card.attachments} compact />
				<div class="editor-tabs" role="tablist">
					<button
						type="button"
						class="editor-tab"
						role="tab"
						aria-selected={tab === 'write'}
						onclick={() => (tab = 'write')}>write</button
					>
					<button
						type="button"
						class="editor-tab"
						role="tab"
						aria-selected={tab === 'preview'}
						onclick={() => (tab = 'preview')}>preview</button
					>
				</div>
				{#if tab === 'write'}
					<div class="editor-write">
						<textarea name="body_md" bind:value={body} spellcheck="false"></textarea>
					</div>
				{:else}
					<div class="editor-preview">{@html previewHtml}</div>
					<textarea name="body_md" value={body} hidden></textarea>
				{/if}
			</div>
			<footer class="modal-foot">
				<button
					type="submit"
					formaction="?/archiveCard"
					class="btn btn-quiet"
					formnovalidate>archive</button
				>
				<span class="modal-meta">{meta}</span>
				<button type="submit" class="btn btn-primary">save</button>
			</footer>
		</form>
	{/if}
</dialog>
