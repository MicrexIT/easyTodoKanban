<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { hueForColumn, relativeTime, renderMarkdown } from '$lib/markdown';
	import AttachmentGallery from '$lib/components/AttachmentGallery.svelte';
	import SearchDialog from '$lib/components/SearchDialog.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let editing = $state(false);
	let title = $state('');
	let body = $state('');

	$effect(() => {
		title = data.card.title;
		body = data.card.body_md;
		editing = false;
	});

	const html = $derived(renderMarkdown(data.card.body_md));
	const hue = $derived(
		hueForColumn(data.card.column_name, data.columnIndex >= 0 ? data.columnIndex : 0)
	);
	const boardHref = $derived(`/p/${data.project.slug}`);

	function resetDraft() {
		title = data.card.title;
		body = data.card.body_md;
		editing = false;
	}

	$effect(() => {
		if (typeof window === 'undefined') return;

		function onEscape(event: KeyboardEvent) {
			if (event.key !== 'Escape' || event.metaKey || event.ctrlKey || event.altKey) return;
			// The topmost dialog owns Escape, so search closes without leaving the card.
			if (document.querySelector('dialog[open]')) return;

			event.preventDefault();
			if (editing) {
				resetDraft();
				return;
			}
			void goto(boardHref);
		}

		window.addEventListener('keydown', onEscape);
		return () => window.removeEventListener('keydown', onEscape);
	});
</script>

<svelte:head>
	<title>#{data.card.id} {data.card.title} — easytodo</title>
</svelte:head>

<header class="topbar">
	<a class="logotype" href="/"><span class="tick">▤</span> easytodo</a>
	<a
		class="item-back"
		href={boardHref}
		aria-label="Back to {data.project.name} board"
		aria-keyshortcuts="Escape"
		title="Back to {data.project.name} board · Esc"
	>←</a>
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href={boardHref}>{data.project.slug}</a>
		<span>/</span>
		<span>{data.card.column_name.toLowerCase()}</span>
		<span>·</span>
		<span>#{data.card.id}</span>
	</nav>
	<div class="topbar-right">
		<SearchDialog projects={data.projects} currentSlug={data.project.slug} />
	</div>
</header>

<div class="sheet-wrap">
	<article class="sheet" data-hue={hue}>
		<div class="sheet-head">
			<div class="status-row">
				<span class="column-tag">{data.card.column_name}</span>
				<span class="id">#{data.card.id}</span>
				<form method="POST" action="?/move" use:enhance class="actions">
					<select
						class="move"
						name="columnId"
						onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
					>
						{#each data.columns as col}
							<option value={col.id} selected={col.id === data.card.column_id}
								>{col.name}</option
							>
						{/each}
					</select>
					{#if !editing}
						<button type="button" class="btn" onclick={() => (editing = true)}>edit</button>
					{/if}
				</form>
			</div>

			{#if editing}
				<form method="POST" action="?/update" use:enhance={() => {
					return async ({ result, update }) => {
						await update();
						if (result.type === 'success') editing = false;
					};
				}}>
					<div class="item-editor">
						<input class="title-input" name="title" bind:value={title} required />
						<textarea name="body_md" bind:value={body} spellcheck="false"></textarea>
						<AttachmentGallery cardId={data.card.id} attachments={data.card.attachments} />
					</div>
					<div class="sheet-foot">
						<button type="button" class="btn" onclick={resetDraft}>cancel</button>
						<button type="submit" class="btn btn-primary">save</button>
					</div>
				</form>
			{:else}
				<h1 class="item-title">{data.card.title}</h1>
				<div class="item-facts">
					created {data.card.created_at.slice(0, 10)} · updated {relativeTime(
						data.card.updated_at
					)}
				</div>
				<AttachmentGallery cardId={data.card.id} attachments={data.card.attachments} />
				<div class="item-body">
					{#if html}
						{@html html}
					{:else}
						<p style="color: var(--ink-3); font-family: var(--mono); font-size: 12px;">
							no body — hit edit to write markdown
						</p>
					{/if}
				</div>
				<div class="sheet-foot">
					<form method="POST" action="?/archive" use:enhance>
						<button type="submit" class="btn btn-quiet">archive</button>
					</form>
				</div>
			{/if}
		</div>
	</article>
</div>
