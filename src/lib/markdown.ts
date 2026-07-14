import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

/** Convert markdown task list items into custom checklist markup. */
function enhanceChecklists(html: string): string {
	// marked renders `- [ ]` as <li><input disabled type="checkbox"> text</li>
	// Rewrite to mockup style: <li class="done?"><span class="box">[ ]</span> <span class="txt">…
	return html
		.replace(
			/<li>\s*<input(?=[^>]*\bchecked\b)[^>]*>\s*/gi,
			'<li class="done"><span class="box">[x]</span> <span class="txt">'
		)
		.replace(
			/<li>\s*<input(?=[^>]*type=["']?checkbox)[^>]*>\s*/gi,
			'<li><span class="box">[ ]</span> <span class="txt">'
		)
		.replace(
			/(class="txt">)([\s\S]*?)(<\/li>)/g,
			(_, a, body, c) => `${a}${body}</span>${c}`
		)
		.replace(/<ul>/g, (match, offset, full) => {
			const slice = full.slice(offset, offset + 400);
			if (slice.includes('class="box"')) return '<ul class="md-check">';
			return match;
		});
}

export function renderMarkdown(md: string): string {
	if (!md?.trim()) return '';
	const raw = marked.parse(md, { async: false }) as string;
	const enhanced = enhanceChecklists(raw);
	if (typeof window === 'undefined') {
		// Server: return unsanitized for now; card body is user-owned personal data.
		// Client path always sanitizes.
		return enhanced;
	}
	return DOMPurify.sanitize(enhanced, {
		USE_PROFILES: { html: true }
	});
}

export function relativeTime(iso: string | null | undefined): string {
	if (!iso) return '';
	// SQLite datetime('now') is UTC without Z — treat as UTC
	const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso.replace(' ', 'T')}Z`;
	const then = new Date(normalized).getTime();
	if (Number.isNaN(then)) return iso;
	const sec = Math.round((Date.now() - then) / 1000);
	if (sec < 60) return 'just now';
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.round(hr / 24);
	if (day === 1) return 'yesterday';
	if (day < 14) return `${day}d ago`;
	return new Date(normalized).toLocaleDateString();
}

/** Cycle column hues by position index (0-based). */
export const COLUMN_HUES = ['todo', 'doing', 'done', 'todo', 'doing', 'done'] as const;

export function hueForIndex(i: number): string {
	const palette = ['todo', 'doing', 'done'] as const;
	return palette[i % palette.length];
}

const NAMED_HUES: Record<string, string> = {
	todo: 'todo',
	backlog: 'todo',
	inbox: 'todo',
	doing: 'doing',
	inprogress: 'doing',
	wip: 'doing',
	done: 'done',
	complete: 'done',
	completed: 'done',
	shipped: 'done'
};

/** Hue follows the column's name when it has a known meaning, so reordering never swaps colours. */
export function hueForColumn(name: string, index: number): string {
	const key = name.toLowerCase().replace(/[^a-z]/g, '');
	return NAMED_HUES[key] ?? hueForIndex(index);
}
