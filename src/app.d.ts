// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				DB: import('@easytodo/db').D1Database;
				MEDIA: R2Bucket;
				GOOGLE_SA_EMAIL?: string;
				GOOGLE_SA_KEY?: string;
				GOOGLE_CALENDAR_ID?: string;
			};
			context: {
				waitUntil(promise: Promise<unknown>): void;
			};
			caches: {
				default: {
					match(request: string): Promise<{ json(): Promise<unknown> } | undefined>;
					put(request: string, response: unknown): Promise<void>;
				};
			};
		}
	}
}

export {};
