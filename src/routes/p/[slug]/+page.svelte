<script lang="ts">
	import { goto } from '$app/navigation';
	import Board from '$lib/components/Board.svelte';
	import Topbar from '$lib/components/Topbar.svelte';
	import AgendaStrip from '$lib/components/AgendaStrip.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	$effect(() => {
		if (form && 'project' in form && form.project) {
			goto(`/p/${form.project.slug}`);
		}
	});
</script>

<svelte:head>
	<title>{data.board.project.name} — easytodo</title>
</svelte:head>

<div style="display:flex;flex-direction:column;height:100%;min-height:100vh;">
	<Topbar projects={data.projects} currentSlug={data.board.project.slug} />
	<AgendaStrip />
	<Board project={data.board.project} columns={data.board.columns} />
</div>
