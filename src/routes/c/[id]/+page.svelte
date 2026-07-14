<script lang="ts">
	import { enhance } from '$app/forms';
	import { hueForColumn, relativeTime, renderMarkdown } from '$lib/markdown';
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
</script>

<svelte:head>
	<title>#{data.card.id} {data.card.title} — easytodo</title>
</svelte:head>

<header class="topbar">
	<a class="logotype" href="/"><span class="tick">▤</span> easytodo</a>
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href="/p/{data.project.slug}">{data.project.slug}</a>
		<span>/</span>
		<span>{data.card.column_name.toLowerCase()}</span>
		<span>·</span>
		<span>#{data.card.id}</span>
	</nav>
	<div class="topbar-right">
		<a href="/p/{data.project.slug}">← board</a>
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
					</div>
					<div class="sheet-foot">
						<button type="button" class="btn" onclick={() => (editing = false)}>cancel</button>
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
