<script lang="ts">
	import type { Project } from '@easytodo/db';
	import { goto, invalidateAll } from '$app/navigation';

	interface Props {
		projects: Project[];
		currentSlug: string;
		archivedHref?: string;
	}

	let { projects, currentSlug, archivedHref = '/archived' }: Props = $props();

	let creating = $state(false);
	let name = $state('');
	let busy = $state(false);

	async function submitCreate(e: Event) {
		e.preventDefault();
		if (!name.trim() || busy) return;
		busy = true;
		try {
			const res = await fetch('/api/create-project', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: name.trim() })
			});
			if (!res.ok) throw new Error(await res.text());
			const project = (await res.json()) as Project;
			creating = false;
			name = '';
			await invalidateAll();
			await goto(`/p/${project.slug}`);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'create failed');
		} finally {
			busy = false;
		}
	}
</script>

<header class="topbar">
	<a class="logotype" href="/"><span class="tick">▤</span> easytodo</a>
	<nav class="projects" aria-label="Projects">
		{#each projects as p (p.id)}
			<a
				class="project-tab"
				href="/p/{p.slug}"
				aria-current={p.slug === currentSlug ? 'true' : undefined}
			>
				{p.slug}
			</a>
		{/each}
		{#if creating}
			<form class="projects" onsubmit={submitCreate}>
				<input
					class="project-tab"
					style="border-color: var(--line); background: var(--card); width: 10ch;"
					placeholder="name"
					bind:value={name}
					aria-label="New project name"
				/>
				<button type="submit" class="project-tab" title="Create" disabled={busy}>✓</button>
				<button
					type="button"
					class="project-tab"
					onclick={() => {
						creating = false;
						name = '';
					}}>×</button
				>
			</form>
		{:else}
			<button
				type="button"
				class="project-tab"
				title="New project"
				onclick={() => (creating = true)}>+</button
			>
		{/if}
	</nav>
	<div class="topbar-right">
		<span class="hint">drag to move · click to edit</span>
		<a href={archivedHref}>archived</a>
	</div>
</header>
