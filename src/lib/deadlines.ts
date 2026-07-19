const ALL_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type DeadlinePresentation = {
	label: string;
	overdue: boolean;
	title: string;
};

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

function localDateKey(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDateFromKey(value: string): Date {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day);
}

export function deadlineToLocalInputs(dueAt: string | null | undefined): {
	date: string;
	time: string;
} {
	if (!dueAt) return { date: '', time: '' };
	if (ALL_DAY.test(dueAt)) return { date: dueAt, time: '' };

	const value = new Date(dueAt);
	if (Number.isNaN(value.getTime())) return { date: '', time: '' };
	return {
		date: localDateKey(value),
		time: `${pad(value.getHours())}:${pad(value.getMinutes())}`
	};
}

export function deadlineFromLocalInputs(date: string, time: string): string | null {
	if (!date) return null;
	if (!time) return date;

	const value = new Date(`${date}T${time}:00`);
	return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

export function deadlinePresentation(
	dueAt: string | null | undefined,
	now = new Date()
): DeadlinePresentation | null {
	if (!dueAt) return null;

	const allDay = ALL_DAY.test(dueAt);
	const due = allDay ? localDateFromKey(dueAt) : new Date(dueAt);
	if (Number.isNaN(due.getTime())) return null;

	const today = localDateFromKey(localDateKey(now));
	const dueDay = localDateFromKey(localDateKey(due));
	const dayDifference = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
	const dayLabel =
		dayDifference === 0
			? 'today'
			: dayDifference === 1
				? 'tomorrow'
				: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(due);
	const timeLabel = allDay
		? ''
		: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(due);
	const title = allDay
		? `Due ${new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(due)}`
		: `Due ${new Intl.DateTimeFormat(undefined, {
				dateStyle: 'long',
				timeStyle: 'short'
			}).format(due)}`;

	return {
		label: timeLabel ? `${dayLabel} · ${timeLabel}` : dayLabel,
		overdue: allDay ? dueDay.getTime() < today.getTime() : due.getTime() < now.getTime(),
		title
	};
}
