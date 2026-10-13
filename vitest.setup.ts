import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Component tests opt into jsdom with `// @vitest-environment jsdom`; cleanup only applies there.
afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});
