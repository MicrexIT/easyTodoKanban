<script lang="ts">
	import type { CardWithContext, Project } from '@easytodo/db';
	import { goto } from '$app/navigation';

	interface Props {
		projects: Project[];
		currentSlug: string;
	}

	type SearchScope = 'board' | 'all';

	let { projects, currentSlug }: Props = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();
	let query = $state('');
	let scope = $state<SearchScope>('board');
	let results = $state<CardWithContext[]>([]);
	let loading = $state(false);
	let errorMessage = $state('');
	let activeIndex = $state(-1);
	let requestSequence = 0;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;

	const currentProject = $derived(projects.find((project) => project.slug === currentSlug));
	const resultSummary = $derived(
		query.trim() && !loading && !errorMessage
			? `${results.length} result${results.length === 1 ? '' : 's'}`
			: ''
	);

	function openSearch() {
		if (dialog?.open) {
			input?.focus();
			input?.select();
			return;
		}

		query = '';
		scope = 'board';
		results = [];
		errorMessage = '';
		activeIndex = -1;
		dialog?.showModal();
		requestAnimationFrame(() => input?.focus());
	}

	function closeSearch() {
		dialog?.close();
	}

	function cancelPendingSearch() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = undefined;
		controller?.abort();
		controller = undefined;
		requestSequence += 1;
	}

	function resetSearch() {
		cancelPendingSearch();
		loading = false;
	}

	function scheduleSearch() {
		cancelPendingSearch();
		activeIndex = -1;
		errorMessage = '';

		const term = query.trim();
		if (!term) {
			results = [];
			loading = false;
			return;
		}

		loading = true;
		debounceTimer = setTimeout(() => void runSearch(term, scope), 160);
	}

	async function runSearch(term: string, requestedScope: SearchScope) {
		const sequence = ++requestSequence;
		controller = new AbortController();
		const params = new URLSearchParams({ q: term });
		if (requestedScope === 'board') params.set('project', currentSlug);

		try {
			const response = await fetch(`/api/search?${params}`, { signal: controller.signal });
			if (!response.ok) throw new Error((await response.text()) || 'Search failed');
			const payload = (await response.json()) as { results: CardWithContext[] };
			if (sequence !== requestSequence) return;
			results = payload.results;
			activeIndex = results.length > 0 ? 0 : -1;
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError') return;
			if (sequence !== requestSequence) return;
			results = [];
			errorMessage = cause instanceof Error ? cause.message : 'Search failed';
		} finally {
			if (sequence === requestSequence) loading = false;
		}
	}

	function setScope(nextScope: SearchScope) {
		if (scope === nextScope) return;
		scope = nextScope;
		scheduleSearch();
		input?.focus();
	}

	async function openResult(result: CardWithContext) {
		closeSearch();
		await goto(`/c/${result.id}`);
	}

	function onInputKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (results.length > 0) activeIndex = (activeIndex + 1) % results.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (results.length > 0) {
				activeIndex = (activeIndex - 1 + results.length) % results.length;
			}
		} else if (event.key === 'Enter' && activeIndex >= 0) {
			event.preventDefault();
			const result = results[activeIndex];
			if (result) void openResult(result);
		}
	}

	function plainText(markdown: string) {
		return markdown
			.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
			.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
			.replace(/[`*_>#~-]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	$effect(() => {
		if (typeof window === 'undefined') return;

		function onShortcut(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
				event.preventDefault();
				openSearch();
			}
		}

		window.addEventListener('keydown', onShortcut);
		return () => window.removeEventListener('keydown', onShortcut);
	});

	$effect(() => {
		if (activeIndex < 0 || typeof document === 'undefined') return;
		requestAnimationFrame(() => {
			document.getElementById(`search-result-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
		});
	});

	$effect(() => () => cancelPendingSearch());
</script>

<button
	type="button"
	class="search-trigger"
	aria-label="Search cards"
	aria-keyshortcuts="Meta+F Control+F"
	onclick={openSearch}
>
	<span class="search-icon" aria-hidden="true"></span>
	<span>search</span>
	<kbd>⌘/Ctrl F</kbd>
</button>

<dialog class="search-dialog" bind:this={dialog} onclose={resetSearch}>
	<div class="search-shell">
		<header class="search-input-row">
			<span class="search-icon" aria-hidden="true"></span>
			<input
				bind:this={input}
				bind:value={query}
				type="search"
				placeholder="Search cards…"
				aria-label="Search cards"
				aria-controls="search-results"
				aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
				oninput={scheduleSearch}
				onkeydown={onInputKeydown}
			/>
			{#if loading}<span class="search-spinner" aria-label="Searching"></span>{/if}
			<button type="button" class="search-close" aria-label="Close search" onclick={closeSearch}
				><kbd>esc</kbd></button
			>
		</header>

		<div class="search-scope-row">
			<div class="search-scopes" role="group" aria-label="Search scope">
				<button
					type="button"
					class:active={scope === 'board'}
					aria-pressed={scope === 'board'}
					onclick={() => setScope('board')}
				>
					<span class="scope-dot"></span>{currentProject?.name ?? 'Current board'}
				</button>
				<button
					type="button"
					class:active={scope === 'all'}
					aria-pressed={scope === 'all'}
					onclick={() => setScope('all')}
				>
					all boards
				</button>
			</div>
			<span class="search-count" role="status" aria-live="polite">{resultSummary}</span>
		</div>

		<div class="search-results" id="search-results" role="listbox" aria-label="Search results">
			{#if errorMessage}
				<div class="search-state error" role="alert">{errorMessage}</div>
			{:else if !query.trim()}
				<div class="search-state">
					<span class="search-state-mark">↵</span>
					<strong>Find anything on this board</strong>
					<span>Search titles, notes, or jump straight to <code>#123</code>.</span>
				</div>
			{:else if !loading && results.length === 0}
				<div class="search-state">
					<span class="search-state-mark">∅</span>
					<strong>No cards found</strong>
					<span>Try another phrase or search across all boards.</span>
				</div>
			{:else}
				{#each results as result, index (result.id)}
					<button
						type="button"
						id="search-result-{index}"
						class="search-result"
						class:active={index === activeIndex}
						role="option"
						aria-selected={index === activeIndex}
						onmouseenter={() => (activeIndex = index)}
						onclick={() => openResult(result)}
					>
						<span class="search-result-main">
							<strong>{result.title}</strong>
							{#if plainText(result.body_md)}
								<span>{plainText(result.body_md)}</span>
							{/if}
						</span>
						<span class="search-result-meta">
							{#if scope === 'all'}<b>{result.project_name}</b><i>›</i>{/if}
							<span>{result.column_name}</span>
							<code>#{result.id}</code>
						</span>
						<span class="search-enter" aria-hidden="true">↵</span>
					</button>
				{/each}
			{/if}
		</div>

		<footer class="search-foot">
			<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
			<span><kbd>↵</kbd> open</span>
			<span>active cards only</span>
		</footer>
	</div>
</dialog>
