// Vitest setup file — loaded once before all tests.
//
// 1) jest-dom matchers (toBeInTheDocument, toHaveClass, ...)
// 2) Auto-cleanup React Testing Library renders between tests so the DOM
//    doesn't accumulate leftover elements (Vitest doesn't auto-cleanup
//    like Jest does).

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
