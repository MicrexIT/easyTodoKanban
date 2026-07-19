<script lang="ts">
	import type { CardWithAttachments as CardType } from '@easytodo/db';
	import { relativeTime, renderMarkdown } from '$lib/markdown';
	import { deadlinePresentation } from '$lib/deadlines';

	interface Props {
		card: CardType;
		onclick?: (card: CardType) => void;
	}

	let { card, onclick }: Props = $props();

	const preview = $derived(renderMarkdown(card.body_md));
	const updated = $derived(relativeTime(card.updated_at));
	const deadline = $derived(deadlinePresentation(card.due_at));

	function handleClick(e: MouseEvent) {
		// Ignore if this was the end of a drag (dnd sets data attribute sometimes)
		if ((e.currentTarget as HTMLElement).classList.contains('dragging')) return;
		onclick?.(card);
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onclick?.(card);
		}
	}
</script>

<div
	class="card"
	tabindex="0"
	role="button"
	data-card-id={card.id}
	onclick={handleClick}
	onkeydown={handleKey}
>
	{#if card.attachments[0]}
		<img
			class="card-cover"
			src="/api/attachments/{card.attachments[0].id}"
			alt=""
			loading="lazy"
		/>
	{/if}
	<div class="card-title">{card.title}</div>
	{#if preview}
		<div class="card-body">{@html preview}</div>
	{/if}
	<div class="card-meta">
		<span class="id">#{card.id}</span>
		<span>updated {updated}</span>
		{#if deadline}
			<span class="due-badge" class:overdue={deadline.overdue} title={deadline.title}
				>due {deadline.label}</span
			>
		{/if}
	</div>
</div>
