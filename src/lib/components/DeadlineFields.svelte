<script lang="ts">
	import { deadlineFromLocalInputs, deadlineToLocalInputs } from '$lib/deadlines';

	interface Props {
		dueAt: string | null;
		idPrefix: string;
	}

	let { dueAt, idPrefix }: Props = $props();
	let dueDate = $state('');
	let dueTime = $state('');

	$effect(() => {
		const inputs = deadlineToLocalInputs(dueAt);
		dueDate = inputs.date;
		dueTime = inputs.time;
	});

	const encodedDeadline = $derived(deadlineFromLocalInputs(dueDate, dueTime) ?? '');

	function clearDeadline() {
		dueDate = '';
		dueTime = '';
	}
</script>

<fieldset class="deadline-fields">
	<legend>deadline</legend>
	<label for={`${idPrefix}-date`}>
		<span>date</span>
		<input id={`${idPrefix}-date`} type="date" bind:value={dueDate} />
	</label>
	<label for={`${idPrefix}-time`}>
		<span>time <small>optional</small></span>
		<input id={`${idPrefix}-time`} type="time" bind:value={dueTime} disabled={!dueDate} />
	</label>
	<input type="hidden" name="due_at" value={encodedDeadline} />
	<button
		type="button"
		class="deadline-clear"
		disabled={!dueDate && !dueTime}
		onclick={clearDeadline}>clear</button
	>
</fieldset>
