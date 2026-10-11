import * as z from 'zod/v4';

// Run before importing the App SDK, which creates schemas during module loading.
// Apps 1.3.2 predates its upstream jitless default. No CSP relaxation is needed.
z.config({ jitless: true });
