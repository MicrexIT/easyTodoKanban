<script lang="ts">
	import type { Project } from '@easytodo/db';
	import { goto, invalidateAll } from '$app/navigation';
	import { dragHandle, dragHandleZone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';

	interface Props {
		projects: Project[];
		currentSlug: string;
		archivedHref?: string;
	}

	let { projects, currentSlug, archivedHref = '/archived' }: Props = $props();

	let creating = $state(false);
	let name = $state('');
	let busy = $state(false);
	let manager: HTMLDialogElement | undefined = $state();
	let localProjects = $state<Project[]>([]);
	let renamingId = $state<number | null>(null);
	let renameDraft = $state('');
	let message = $state('');

	$effect(() => {
		localProjects = projects.map((project) => ({ ...project }));
	});

	async function postJson(url: string, body: unknown) {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!response.ok) throw new Error((await response.text()) || response.statusText);
		return response.json();
	}

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

	function startRename(project: Project) {
		renamingId = project.id;
		renameDraft = project.name;
	}

	async function commitRename(project: Project) {
		if (renamingId !== project.id) return;
		const nextName = renameDraft.trim();
		renamingId = null;
		if (!nextName || nextName === project.name) return;
		try {
			const updated = (await postJson('/api/rename-project', {
				projectId: project.id,
				name: nextName
			})) as Project;
			localProjects = localProjects.map((item) => (item.id === updated.id ? updated : item));
			await invalidateAll();
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'rename failed';
		}
	}

	function onProjectsConsider(event: CustomEvent<DndEvent<Project>>) {
		localProjects = event.detail.items;
	}

	async function onProjectsFinalize(event: CustomEvent<DndEvent<Project>>) {
		localProjects = event.detail.items;
		const movedId = Number(event.detail.info.id);
		const index = localProjects.findIndex((project) => project.id === movedId);
		if (index < 0) return;
		try {
			await postJson('/api/reorder-project', {
				projectId: movedId,
				beforeProjectId: localProjects[index + 1]?.id ?? null
			});
			await invalidateAll();
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'reorder failed';
			await invalidateAll();
		}
	}

	async function removeProject(project: Project) {
		if (localProjects.length <= 1) {
			message = 'The last board cannot be deleted.';
			return;
		}
		if (!confirm(`delete board "${project.name}" and all of its cards?`)) return;
		try {
			const result = (await postJson('/api/delete-project', { projectId: project.id })) as {
				nextSlug: string | null;
			};
			localProjects = localProjects.filter((item) => item.id !== project.id);
			if (project.slug === currentSlug && result.nextSlug) {
				manager?.close();
				await goto(`/p/${result.nextSlug}`);
			} else {
				await invalidateAll();
			}
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'delete failed';
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
				{p.name}
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
		<button
			type="button"
			class="project-tab manage-projects"
			title="Manage boards"
			onclick={() => {
				message = '';
				manager?.showModal();
			}}>manage</button
		>
	</nav>
	<div class="topbar-right">
		<span class="hint">drag to move · pull edge to resize · click to edit</span>
		<a href={archivedHref}>archived</a>
	</div>
</header>

<dialog class="board-manager" bind:this={manager} onclose={() => (renamingId = null)}>
	<header class="manager-head">
		<div>
			<strong>manage boards</strong>
			<span>drag to reorder · rename inline</span>
		</div>
		<button type="button" class="modal-close" aria-label="Close" onclick={() => manager?.close()}
			>×</button
		>
	</header>
	<div
		class="manager-list"
		use:dragHandleZone={{
			items: localProjects,
			flipDurationMs: 160,
			type: 'project',
			dropTargetStyle: {}
		}}
		onconsider={onProjectsConsider}
		onfinalize={onProjectsFinalize}
	>
		{#each localProjects as project (project.id)}
			<div class="manager-row" animate:flip={{ duration: 160 }}>
				<button
					type="button"
					class="manager-grip"
					use:dragHandle
					aria-label="Move {project.name}"
					title="Drag to reorder">⠿</button
				>
				<div class="manager-name">
					{#if renamingId === project.id}
						<input
							bind:value={renameDraft}
							aria-label="Board name"
							onblur={() => commitRename(project)}
							onkeydown={(event) => {
								if (event.key === 'Enter') commitRename(project);
								if (event.key === 'Escape') renamingId = null;
							}}
						/>
					{:else}
						<a href="/p/{project.slug}" onclick={() => manager?.close()}>{project.name}</a>
						<small>/{project.slug}</small>
					{/if}
				</div>
				{#if project.is_default}<span class="default-badge">default</span>{/if}
				<button type="button" class="manager-action" onclick={() => startRename(project)}
					>rename</button
				>
				<button
					type="button"
					class="manager-action danger"
					disabled={localProjects.length <= 1}
					title={localProjects.length <= 1 ? 'The last board cannot be deleted' : 'Delete board'}
					onclick={() => removeProject(project)}>delete</button
				>
			</div>
		{/each}
	</div>
	<footer class="manager-foot">
		<span role="status">{message}</span>
		<button type="button" class="btn" onclick={() => manager?.close()}>done</button>
	</footer>
</dialog>
