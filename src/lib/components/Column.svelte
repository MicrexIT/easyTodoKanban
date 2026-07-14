<script lang="ts">
	import type { BoardColumn, Card as CardType } from '@easytodo/db';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import Card from './Card.svelte';

	interface Props {
		column: BoardColumn;
		hue: string;
		onOpenCard: (card: CardType) => void;
		onAddCard: (columnId: number) => void;
		onRename: (columnId: number, name: string) => void;
		onCardsReorder: (columnId: number, cards: CardType[]) => void;
		onConsider: (columnId: number, cards: CardType[]) => void;
	}

	let { column, hue, onOpenCard, onAddCard, onRename, onCardsReorder, onConsider }: Props =
		$props();

	let items = $state<CardType[]>([]);
	let dragOver = $state(false);
	let renaming = $state(false);
	let nameDraft = $state('');

	$effect(() => {
		items = column.cards.map((c) => ({ ...c }));
	});

	const flipDurationMs = 180;

	function handleConsider(e: CustomEvent<DndEvent<CardType>>) {
		items = e.detail.items as CardType[];
		dragOver = true;
		onConsider(column.id, items);
	}

	function handleFinalize(e: CustomEvent<DndEvent<CardType>>) {
		items = e.detail.items as CardType[];
		dragOver = false;
		onCardsReorder(column.id, items);
	}

	function startRename() {
		nameDraft = column.name;
		renaming = true;
	}

	function commitRename() {
		renaming = false;
		const n = nameDraft.trim();
		if (n && n !== column.name) onRename(column.id, n);
	}
</script>

<section class="column" data-hue={hue} aria-label={column.name}>
	<header class="column-head">
		{#if renaming}
			<input
				class="column-tag"
				style="width: auto; min-width: 4ch;"
				bind:value={nameDraft}
				onblur={commitRename}
				onkeydown={(e) => e.key === 'Enter' && commitRename()}
			/>
		{:else}
			<button type="button" class="column-tag" onclick={startRename} title="Rename column">
				{column.name}
			</button>
		{/if}
		<span class="column-count">{items.length}</span>
		<button
			type="button"
			class="column-add"
			title="Add card to {column.name}"
			onclick={() => onAddCard(column.id)}
		>
			＋
		</button>
	</header>

	<div
		class="cards"
		class:drag-over={dragOver}
		use:dndzone={{
			items,
			flipDurationMs,
			type: 'card',
			dropTargetStyle: {},
			dropTargetClasses: ['drag-over']
		}}
		onconsider={handleConsider}
		onfinalize={handleFinalize}
	>
		{#each items as card (card.id)}
			<div class="card-wrap" animate:flip={{ duration: flipDurationMs }}>
				<Card {card} onclick={onOpenCard} />
			</div>
		{/each}
	</div>
	{#if items.length === 0}
		<div class="column-empty">empty — drop a card or ＋</div>
	{/if}
</section>
