import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Tests must never reach Resend: the transport is stubbed via
    // __setEmailSenderForTests and no RESEND_API_KEY is provided.
    env: {
      NEXT_PUBLIC_APP_URL: 'https://recruitment.bimedhealthcare.com',
    },
  },
});
