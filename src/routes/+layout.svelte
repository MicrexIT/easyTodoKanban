<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	let { children } = $props();
</script>

<svelte:head>
	<title>easytodo</title>
	<link rel="icon" href={favicon} />
	<meta name="description" content="personal kanban for you and your agents" />
</svelte:head>

{@render children()}
