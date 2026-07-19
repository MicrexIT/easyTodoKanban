<script lang="ts">
	import type { GoogleCalendarEvent } from '@easytodo/gcal';

	let expanded = $state(false);
	let date = $state('');
	let loading = $state(false);
	let message = $state('');
	let events = $state<GoogleCalendarEvent[]>([]);
	let requestNumber = 0;

	function localToday(): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	$effect(() => {
		if (typeof window !== 'undefined' && !date) date = localToday();
	});

	async function loadAgenda(): Promise<void> {
		if (!date) return;
		const currentRequest = ++requestNumber;
		loading = true;
		message = '';
		try {
			const response = await fetch(`/api/agenda?date=${encodeURIComponent(date)}`);
			if (!response.ok) {
				const raw = await response.text();
				let reason = raw || response.statusText;
				try {
					const payload = JSON.parse(raw) as { message?: unknown };
					if (typeof payload.message === 'string') reason = payload.message;
				} catch {
					// Plain-text errors are already suitable for display.
				}
				throw new Error(reason);
			}
			const payload = (await response.json()) as { events: GoogleCalendarEvent[] };
			if (currentRequest === requestNumber) events = payload.events;
		} catch (cause) {
			if (currentRequest === requestNumber) {
				events = [];
				message = cause instanceof Error ? cause.message : 'calendar unavailable';
			}
		} finally {
			if (currentRequest === requestNumber) loading = false;
		}
	}

	function toggle(): void {
		expanded = !expanded;
		if (expanded && events.length === 0 && !message) void loadAgenda();
	}

	function eventTime(event: GoogleCalendarEvent): string {
		if (event.start.date) return 'all day';
		if (!event.start.dateTime) return 'time n/a';
		return new Intl.DateTimeFormat(undefined, {
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(event.start.dateTime));
	}
</script>

<section class="agenda-strip" class:expanded aria-label="Google Calendar agenda">
	<div class="agenda-controls">
		<button
			type="button"
			class="agenda-toggle"
			aria-expanded={expanded}
			onclick={toggle}
		>
			<span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
			agenda
		</button>
		{#if expanded}
			<label>
				<span>show day</span>
				<input type="date" bind:value={date} onchange={() => void loadAgenda()} />
			</label>
			<button type="button" class="agenda-refresh" onclick={() => void loadAgenda()}>refresh</button>
		{/if}
	</div>

	{#if expanded}
		<div class="agenda-events" aria-live="polite" aria-busy={loading}>
			{#if loading}
				<span class="agenda-status">loading…</span>
			{:else if message}
				<span class="agenda-status agenda-error">{message}</span>
			{:else if events.length === 0}
				<span class="agenda-status">nothing scheduled</span>
			{:else}
				{#each events as event (event.id)}
					<a href={event.htmlLink} target="_blank" rel="noreferrer" class="agenda-event">
						<time>{eventTime(event)}</time>
						<span>{event.summary || '(untitled)'}</span>
					</a>
				{/each}
			{/if}
		</div>
	{/if}
</section>
