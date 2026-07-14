<script lang="ts">
	import type { Card as CardType } from '@easytodo/db';
	import { relativeTime, renderMarkdown } from '$lib/markdown';

	interface Props {
		card: CardType;
		onclick?: (card: CardType) => void;
	}

	let { card, onclick }: Props = $props();

	const preview = $derived(renderMarkdown(card.body_md));
	const updated = $derived(relativeTime(card.updated_at));

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
	<div class="card-title">{card.title}</div>
	{#if preview}
		<div class="card-body">{@html preview}</div>
	{/if}
	<div class="card-meta">
		<span class="id">#{card.id}</span>
		<span>updated {updated}</span>
	</div>
</div>
