<script lang="ts">
	import { enhance } from '$app/forms';
	import Topbar from '$lib/components/Topbar.svelte';
	import { relativeTime } from '$lib/markdown';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>archived — easytodo</title>
</svelte:head>

<div style="display:flex;flex-direction:column;min-height:100vh;">
	<Topbar projects={data.projects} currentSlug={data.currentSlug} />
	<div class="archived-wrap">
		<h1>archived</h1>
		{#if data.archived.length === 0}
			<p style="font-family:var(--mono);font-size:12px;color:var(--ink-3);">
				nothing archived yet
			</p>
		{:else}
			<ul class="archived-list">
				{#each data.archived as card (card.id)}
					<li class="card">
						<div class="card-title">{card.title}</div>
						<div class="card-meta">
							<span class="id">#{card.id}</span>
							<span>{card.project_slug} / {card.column_name}</span>
							<span>archived {relativeTime(card.archived_at)}</span>
						</div>
						<div class="archived-actions">
							<form method="POST" action="?/restore" use:enhance>
								<input type="hidden" name="cardId" value={card.id} />
								<button type="submit" class="btn">restore</button>
							</form>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="cardId" value={card.id} />
								<button type="submit" class="btn btn-quiet">delete forever</button>
							</form>
							<a class="btn" href="/c/{card.id}">open ⤢</a>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
