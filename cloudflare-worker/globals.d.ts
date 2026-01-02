// Declare Cloudflare Worker secrets and helpers for the editor/TypeScript server.
// This file makes the global secret names available to the TypeScript checker
// so the editor stops reporting "Cannot find name 'FOO'" for secrets.

declare const RESEND_API_KEY: string | undefined;
declare const FROM_EMAIL: string | undefined;
declare const WORKER_SECRET: string | undefined;
declare const FIREBASE_SA: string | undefined;
declare const FIREBASE_SA_B64: string | undefined;
declare const FIREBASE_DB_URL: string | undefined;

declare function FIREBASE_SA_FROM_ENV(): string | null;
declare function FIREBASE_SA_B64_FROM_ENV(): string | null;
declare function FIREBASE_DB_URL_FROM_ENV(): string | null;
