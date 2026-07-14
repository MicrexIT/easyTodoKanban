<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<title>easytodo</title>
	<meta name="description" content="personal kanban for you and your agents" />
</svelte:head>

{@render children()}
