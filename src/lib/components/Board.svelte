<script lang="ts">
	import type { BoardColumn, Card as CardType, Project } from '@easytodo/db';
	import { invalidateAll } from '$app/navigation';
	import Column from './Column.svelte';
	import CardModal from './CardModal.svelte';
	import { hueForIndex } from '$lib/markdown';

	interface Props {
		project: Project;
		columns: BoardColumn[];
	}

	let { project, columns }: Props = $props();

	// Local optimistic board state
	let localColumns = $state<BoardColumn[]>([]);

	$effect(() => {
		localColumns = columns.map((c) => ({ ...c, cards: c.cards.map((card) => ({ ...card })) }));
	});

	let modalOpen = $state(false);
	let activeCard = $state<CardType | null>(null);
	let activeColumnName = $state('');
	let toast = $state('');
	let isMobile = $state(false);

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(max-width: 640px)');
		const apply = () => (isMobile = mq.matches);
		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	});

	function showToast(msg: string) {
		toast = msg;
		setTimeout(() => {
			if (toast === msg) toast = '';
		}, 2800);
	}

	function openCard(card: CardType) {
		if (isMobile) {
			window.location.href = `/c/${card.id}`;
			return;
		}
		const col = localColumns.find((c) => c.cards.some((x) => x.id === card.id));
		activeColumnName = col?.name ?? '';
		activeCard = card;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		activeCard = null;
	}

	async function postJson(url: string, body: unknown) {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(text || res.statusText);
		}
		return res.json().catch(() => ({}));
	}

	async function onCardsReorder(columnId: number, cards: CardType[]) {
		// Update local column list
		localColumns = localColumns.map((c) =>
			c.id === columnId ? { ...c, cards: cards.map((x) => ({ ...x, column_id: columnId })) } : c
		);

		// Find which card moved (from another column or reordered)
		// We send moves for every card whose column_id or position neighbors changed.
		// Simpler: for each card in the new list, if previous column differed or order changed, move with before_card_id.
		try {
			for (let i = 0; i < cards.length; i++) {
				const card = cards[i];
				const before = cards[i + 1]?.id ?? null;
				const prevCol = columns.flatMap((c) => c.cards).find((x) => x.id === card.id);
				const prevSameCol = columns.find((c) => c.id === columnId)?.cards ?? [];
				const prevIdx = prevSameCol.findIndex((x) => x.id === card.id);
				const prevBefore = prevIdx >= 0 ? (prevSameCol[prevIdx + 1]?.id ?? null) : null;
				const movedCol = prevCol?.column_id !== columnId;
				const movedOrder = prevIdx !== i || prevBefore !== before;
				if (movedCol || movedOrder) {
					await postJson('/api/move-card', {
						cardId: card.id,
						columnId,
						beforeCardId: before
					});
				}
			}
			await invalidateAll();
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'move failed');
			await invalidateAll();
		}
	}

	function onConsider(columnId: number, cards: CardType[]) {
		// Drop from other columns optimistically while dragging
		const ids = new Set(cards.map((c) => c.id));
		localColumns = localColumns.map((c) => {
			if (c.id === columnId) return { ...c, cards };
			return { ...c, cards: c.cards.filter((x) => !ids.has(x.id)) };
		});
	}

	async function onAddCard(columnId: number) {
		const title = prompt('card title');
		if (!title?.trim()) return;
		try {
			await postJson('/api/create-card', {
				projectId: project.id,
				columnId,
				title: title.trim()
			});
			await invalidateAll();
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'create failed');
		}
	}

	async function onRename(columnId: number, name: string) {
		try {
			await postJson('/api/rename-column', { columnId, name });
			await invalidateAll();
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'rename failed');
		}
	}

	async function addColumn() {
		const name = prompt('column name');
		if (!name?.trim()) return;
		try {
			await postJson('/api/create-column', { projectId: project.id, name: name.trim() });
			await invalidateAll();
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'column create failed');
		}
	}

	// Keyboard: n = new card in first column
	$effect(() => {
		if (typeof window === 'undefined') return;
		function onKey(e: KeyboardEvent) {
			if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
				const t = e.target as HTMLElement;
				if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
				if (localColumns[0]) {
					e.preventDefault();
					onAddCard(localColumns[0].id);
				}
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<main class="board">
	{#each localColumns as col, i (col.id)}
		<Column
			column={col}
			hue={hueForIndex(i)}
			onOpenCard={openCard}
			onAddCard={onAddCard}
			onRename={onRename}
			onCardsReorder={onCardsReorder}
			onConsider={onConsider}
		/>
	{/each}
	<button type="button" class="add-column" onclick={addColumn}>＋ add column</button>
</main>

<CardModal
	open={modalOpen}
	card={activeCard}
	{project}
	columnName={activeColumnName}
	onClose={closeModal}
/>

{#if toast}
	<div class="toast" role="status">{toast}</div>
{/if}
