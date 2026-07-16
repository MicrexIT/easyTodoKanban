<script lang="ts">
	import type { BoardColumn, CardWithAttachments as CardType, Project } from '@easytodo/db';
	import { invalidateAll } from '$app/navigation';
	import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import Column from './Column.svelte';
	import CardModal from './CardModal.svelte';
	import { hueForColumn } from '$lib/markdown';

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
	let columnWidths = $state<Record<number, number>>({});
	let collapsedColumns = $state<Record<number, boolean>>({});

	interface PendingCardMove {
		cardId: number;
		columnId: number;
		beforeCardId: number | null;
	}

	let pendingCardMoves: PendingCardMove[] = [];
	let isSavingCardMoves = false;

	const flipDurationMs = 180;
	const defaultColumnWidth = 296;
	const minColumnWidth = 260;
	const maxColumnWidth = 720;
	const columnWidthStoragePrefix = 'easytodo:column-widths:';
	const collapsedColumnStoragePrefix = 'easytodo:collapsed-columns:';

	function isUnknownRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function normalizeColumnWidth(width: number) {
		return Math.round(Math.min(maxColumnWidth, Math.max(minColumnWidth, width)));
	}

	function loadColumnWidths(projectId: number) {
		try {
			const stored = localStorage.getItem(`${columnWidthStoragePrefix}${projectId}`);
			if (!stored) return {};
			const parsed: unknown = JSON.parse(stored);
			if (!isUnknownRecord(parsed)) return {};

			const widths: Record<number, number> = {};
			for (const [id, width] of Object.entries(parsed)) {
				const columnId = Number(id);
				if (Number.isInteger(columnId) && typeof width === 'number' && Number.isFinite(width)) {
					widths[columnId] = normalizeColumnWidth(width);
				}
			}
			return widths;
		} catch {
			return {};
		}
	}

	function getColumnWidth(columnId: number) {
		return columnWidths[columnId] ?? defaultColumnWidth;
	}

	function loadCollapsedColumns(projectId: number) {
		try {
			const stored = localStorage.getItem(`${collapsedColumnStoragePrefix}${projectId}`);
			if (!stored) return {};
			const parsed: unknown = JSON.parse(stored);
			if (!Array.isArray(parsed)) return {};

			const collapsed: Record<number, boolean> = {};
			for (const id of parsed) {
				if (typeof id === 'number' && Number.isInteger(id)) collapsed[id] = true;
			}
			return collapsed;
		} catch {
			return {};
		}
	}

	function persistCollapsedColumns(collapsed: Record<number, boolean>) {
		try {
			localStorage.setItem(
				`${collapsedColumnStoragePrefix}${project.id}`,
				JSON.stringify(Object.keys(collapsed).map(Number))
			);
		} catch {
			// Collapsing still works when browser storage is unavailable.
		}
	}

	function toggleColumn(columnId: number) {
		const next = { ...collapsedColumns };
		if (next[columnId]) delete next[columnId];
		else next[columnId] = true;
		collapsedColumns = next;
		persistCollapsedColumns(next);
	}

	function toggleAllColumns() {
		if (localColumns.length === 0) return;
		const allCollapsed = localColumns.every((column) => collapsedColumns[column.id]);
		const next: Record<number, boolean> = {};
		if (!allCollapsed) {
			for (const column of localColumns) next[column.id] = true;
		}

		collapsedColumns = next;
		persistCollapsedColumns(next);
		showToast(
			allCollapsed ? 'all columns expanded · ⇧C to collapse' : 'all columns collapsed · ⇧C to expand'
		);
	}

	function onColumnResize(columnId: number, width: number, persist: boolean) {
		const nextWidths = { ...columnWidths, [columnId]: normalizeColumnWidth(width) };
		columnWidths = nextWidths;
		if (!persist) return;

		try {
			localStorage.setItem(
				`${columnWidthStoragePrefix}${project.id}`,
				JSON.stringify(nextWidths)
			);
		} catch {
			// Resizing still works when browser storage is unavailable.
		}
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		columnWidths = loadColumnWidths(project.id);
		collapsedColumns = loadCollapsedColumns(project.id);
	});

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

	async function savePendingCardMoves() {
		if (isSavingCardMoves) return;
		isSavingCardMoves = true;

		try {
			while (pendingCardMoves.length > 0) {
				const move = pendingCardMoves.shift();
				if (!move) continue;
				await postJson('/api/move-card', move);
			}
		} catch (e) {
			pendingCardMoves = [];
			showToast(e instanceof Error ? e.message : 'move failed');
			await invalidateAll();
		} finally {
			isSavingCardMoves = false;
			// A drop can be finalized while the failure refresh is in progress.
			if (pendingCardMoves.length > 0) void savePendingCardMoves();
		}
	}

	function queueCardMove(move: PendingCardMove) {
		// If the same card is moved again before its previous queued save starts,
		// only the latest destination matters. In-flight saves remain serialized.
		pendingCardMoves = pendingCardMoves.filter((pending) => pending.cardId !== move.cardId);
		pendingCardMoves.push(move);
		void savePendingCardMoves();
	}

	function onCardsReorder(columnId: number, cards: CardType[], movedCardId: number | null) {
		// Both source and target columns finalize a cross-column drop. Always update
		// the optimistic UI, but persist only the target column's finalize event.
		localColumns = localColumns.map((c) =>
			c.id === columnId ? { ...c, cards: cards.map((x) => ({ ...x, column_id: columnId })) } : c
		);

		if (movedCardId === null) return;
		const movedIndex = cards.findIndex((card) => card.id === movedCardId);
		if (movedIndex === -1) return;

		queueCardMove({
			cardId: movedCardId,
			columnId,
			beforeCardId: cards[movedIndex + 1]?.id ?? null
		});
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

	function onColumnsConsider(e: CustomEvent<DndEvent<BoardColumn>>) {
		localColumns = e.detail.items;
	}

	async function onColumnsFinalize(e: CustomEvent<DndEvent<BoardColumn>>) {
		const items = e.detail.items;
		localColumns = items;

		const movedId = Number(e.detail.info.id);
		const idx = items.findIndex((c) => c.id === movedId);
		if (idx === -1) return;
		// null means "last" — reorderColumn appends when there is no column after it.
		const beforeColumnId = items[idx + 1]?.id ?? null;

		try {
			await postJson('/api/reorder-column', { columnId: movedId, beforeColumnId });
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'reorder failed');
		}
		await invalidateAll();
	}

	async function onDeleteColumn(columnId: number) {
		const col = localColumns.find((c) => c.id === columnId);
		if (!col) return;
		if (col.cards.length > 0) {
			const n = col.cards.length;
			showToast(`"${col.name}" has ${n} card${n === 1 ? '' : 's'} — move or archive them first`);
			return;
		}
		if (!confirm(`delete column "${col.name}"?`)) return;
		try {
			await postJson('/api/delete-column', { columnId });
			await invalidateAll();
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'delete failed');
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

	// Keyboard: n = new card in first column · Shift+C = toggle all columns
	$effect(() => {
		if (typeof window === 'undefined') return;
		function onKey(e: KeyboardEvent) {
			const t = e.target as HTMLElement;
			if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;

			if (
				e.shiftKey &&
				e.key.toLowerCase() === 'c' &&
				!e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				!e.repeat
			) {
				e.preventDefault();
				toggleAllColumns();
				return;
			}

			if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
	<div
		class="board-columns"
		use:dragHandleZone={{
			items: localColumns,
			flipDurationMs,
			type: 'column',
			dropTargetStyle: {}
		}}
		onconsider={onColumnsConsider}
		onfinalize={onColumnsFinalize}
	>
		{#each localColumns as col, i (col.id)}
			<div
				class="column-slot"
				class:collapsed={collapsedColumns[col.id]}
				style={`--column-width: ${getColumnWidth(col.id)}px`}
				animate:flip={{ duration: flipDurationMs }}
			>
				<Column
					column={col}
					width={getColumnWidth(col.id)}
					defaultWidth={defaultColumnWidth}
					collapsed={Boolean(collapsedColumns[col.id])}
					hue={hueForColumn(col.name, i)}
					onOpenCard={openCard}
					onAddCard={onAddCard}
					onRename={onRename}
					onDelete={onDeleteColumn}
					onCardsReorder={onCardsReorder}
					onConsider={onConsider}
					onResize={onColumnResize}
					onToggleCollapse={toggleColumn}
				/>
			</div>
		{/each}
	</div>
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
