<script lang="ts">
	import type { BoardColumn, CardWithAttachments as CardType } from '@easytodo/db';
	import { dndzone, dragHandle, TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import Card from './Card.svelte';

	interface Props {
		column: BoardColumn;
		width: number;
		defaultWidth: number;
		hue: string;
		onOpenCard: (card: CardType) => void;
		onAddCard: (columnId: number) => void;
		onRename: (columnId: number, name: string) => void;
		onDelete: (columnId: number) => void;
		onCardsReorder: (columnId: number, cards: CardType[], movedCardId: number | null) => void;
		onConsider: (columnId: number, cards: CardType[]) => void;
		onResize: (columnId: number, width: number, persist: boolean) => void;
	}

	let {
		column,
		width,
		defaultWidth,
		hue,
		onOpenCard,
		onAddCard,
		onRename,
		onDelete,
		onCardsReorder,
		onConsider,
		onResize
	}: Props = $props();

	let items = $state<CardType[]>([]);
	let dragOver = $state(false);
	let renaming = $state(false);
	let nameDraft = $state('');
	let resizing = $state(false);
	let resizePointerId: number | null = null;
	let resizeStartX = 0;
	let resizeStartWidth = 0;

	$effect(() => {
		items = column.cards.map((c) => ({ ...c }));
	});

	const flipDurationMs = 180;
	const keyboardResizeStep = 24;

	function handleConsider(e: CustomEvent<DndEvent<CardType>>) {
		items = e.detail.items as CardType[];
		dragOver = true;
		onConsider(column.id, items);
	}

	function handleFinalize(e: CustomEvent<DndEvent<CardType>>) {
		items = e.detail.items as CardType[];
		dragOver = false;
		const movedCardId = Number(e.detail.info.id);
		const shouldPersist = e.detail.info.trigger === TRIGGERS.DROPPED_INTO_ZONE;
		onCardsReorder(
			column.id,
			items,
			shouldPersist && Number.isFinite(movedCardId) ? movedCardId : null
		);
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

	function startResize(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		resizing = true;
		resizePointerId = event.pointerId;
		resizeStartX = event.clientX;
		resizeStartWidth = width;
		(event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
	}

	function moveResize(event: PointerEvent) {
		if (!resizing || event.pointerId !== resizePointerId) return;
		onResize(column.id, resizeStartWidth + event.clientX - resizeStartX, false);
	}

	function finishResize(event: PointerEvent) {
		if (!resizing || event.pointerId !== resizePointerId) return;
		const handle = event.currentTarget as HTMLButtonElement;
		onResize(column.id, resizeStartWidth + event.clientX - resizeStartX, true);
		resizing = false;
		resizePointerId = null;
		if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
	}

	function cancelResize(event: PointerEvent) {
		if (!resizing || event.pointerId !== resizePointerId) return;
		const handle = event.currentTarget as HTMLButtonElement;
		onResize(column.id, width, true);
		resizing = false;
		resizePointerId = null;
		if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
	}

	function resizeWithKeyboard(event: KeyboardEvent) {
		if (event.key === 'Home') {
			event.preventDefault();
			onResize(column.id, defaultWidth, true);
			return;
		}
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		const direction = event.key === 'ArrowRight' ? 1 : -1;
		const step = event.shiftKey ? keyboardResizeStep * 3 : keyboardResizeStep;
		onResize(column.id, width + direction * step, true);
	}
</script>

<section class="column" class:resizing data-hue={hue} aria-label={column.name}>
	<header class="column-head">
		<span class="column-grip" use:dragHandle aria-label="Reorder {column.name}" title="Drag to reorder"
			>⠿</span
		>
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
		<button
			type="button"
			class="column-del"
			title="Delete {column.name}"
			aria-label="Delete column {column.name}"
			onclick={() => onDelete(column.id)}
		>
			×
		</button>
	</header>

	<div
		class="cards"
		class:drag-over={dragOver}
		class:is-empty={items.length === 0}
		aria-label={items.length === 0 ? `Empty ${column.name} column. Drop a card here.` : undefined}
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
	<button
		type="button"
		class="column-resizer"
		aria-label="Resize {column.name} column, currently {width} pixels"
		title="Drag to resize · arrow keys adjust · Home resets"
		onpointerdown={startResize}
		onpointermove={moveResize}
		onpointerup={finishResize}
		onpointercancel={cancelResize}
		onlostpointercapture={cancelResize}
		onkeydown={resizeWithKeyboard}
		ondblclick={(event) => {
			event.preventDefault();
			event.stopPropagation();
			onResize(column.id, defaultWidth, true);
		}}
	></button>
</section>
