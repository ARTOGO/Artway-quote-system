import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuoteProvider, useQuoteState } from '../state/QuoteContext';
import { createBlankQuote } from '../state/quoteReducer';
import type { Quote } from '../state/quoteTypes';
import { useSaveQuote } from './useSaveQuote';

// Regression coverage for Codex P2-1: a brand-new quote's create POST resolves
// AFTER the user has touched state. The stamp must key off the quote *instance*
// (which survives field edits) — NOT object identity — so:
//   • an in-place edit during the create still stamps id/quote_no (otherwise the
//     next save POSTs a 2nd row + burns a 2nd serial), and
//   • a 新報價 mid-create does NOT stamp the now-different blank quote.

function blankNoNumber(): Quote {
  const b = createBlankQuote();
  return { ...b, meta: { ...b.meta, quoteNo: '' } };
}

function createResponse(): Response {
  return new Response(
    JSON.stringify({
      id: 'uuid-1',
      quote_no: 'AW-260521-001',
      created_at: '2026-05-21T00:00:00Z',
      updated_at: '2026-05-21T00:00:00Z',
    }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  );
}
function updateResponse(): Response {
  return new Response(JSON.stringify({ id: 'uuid-1', updated_at: '2026-05-21T01:00:00Z' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Imperative handle so the test can drive save/edit/newQuote with precise timing.
interface Handle {
  save: () => Promise<unknown>;
  edit: () => void;
  newQuote: () => void;
}
const handle: { current: Handle | null } = { current: null };

function Harness(): React.JSX.Element {
  const { state, setMeta, newQuote } = useQuoteState();
  const { save, status } = useSaveQuote();
  handle.current = {
    save: () => save().catch(() => undefined),
    edit: () => setMeta('title', 'edited-mid-flight'),
    newQuote,
  };
  return (
    <>
      <span data-testid="id">{state.id ?? 'null'}</span>
      <span data-testid="qno">{state.meta.quoteNo}</span>
      <span data-testid="title">{state.meta.title}</span>
      <span data-testid="status">{status}</span>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  handle.current = null;
});

describe('useSaveQuote — instance-epoch stamping (Codex P2-1)', () => {
  it('a create resolving after an in-place edit still stamps id/quote_no, so the next save UPDATEs (exactly one create)', async () => {
    let resolveCreate!: (r: Response) => void;
    const pendingCreate = new Promise<Response>((r) => {
      resolveCreate = r;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      return method === 'POST' ? pendingCreate : Promise.resolve(updateResponse());
    });

    render(
      <QuoteProvider initial={blankNoNumber()}>
        <Harness />
      </QuoteProvider>,
    );

    // 1) Start the create (POST in-flight).
    let savePromise!: Promise<unknown>;
    act(() => {
      savePromise = handle.current!.save();
    });
    // 2) Edit a field while the POST is still in-flight (same instance).
    act(() => handle.current!.edit());
    expect(screen.getByTestId('title').textContent).toBe('edited-mid-flight');

    // 3) Resolve the create and let the save chain (stamp) finish.
    await act(async () => {
      resolveCreate(createResponse());
      await savePromise;
    });

    // Stamp applied despite the mid-flight edit.
    expect(screen.getByTestId('id').textContent).toBe('uuid-1');
    expect(screen.getByTestId('qno').textContent).toBe('AW-260521-001');

    // P2-B: the mid-flight edit was NOT in the POST body, so the status must
    // NOT claim success — it stays idle (存到雲端) to prompt a re-save rather
    // than falsely flash 已存到雲端.
    expect(screen.getByTestId('status').textContent).toBe('idle');

    // 4) Next save must UPDATE (PUT) the created row — not create a 2nd one.
    await act(async () => {
      await handle.current!.save();
    });
    await waitFor(() => {
      const methods = fetchSpy.mock.calls.map((c) => (c[1] as RequestInit | undefined)?.method);
      expect(methods.filter((m) => m === 'POST')).toHaveLength(1); // exactly ONE create
      expect(methods).toContain('PUT');
    });
  });

  it('a create resolving after 新報價 does NOT stamp the new blank quote', async () => {
    let resolveCreate!: (r: Response) => void;
    const pendingCreate = new Promise<Response>((r) => {
      resolveCreate = r;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      return method === 'POST' ? pendingCreate : Promise.resolve(updateResponse());
    });

    render(
      <QuoteProvider initial={blankNoNumber()}>
        <Harness />
      </QuoteProvider>,
    );

    let savePromise!: Promise<unknown>;
    act(() => {
      savePromise = handle.current!.save();
    });
    // Switch to a fresh quote mid-create (bumps the instance).
    act(() => handle.current!.newQuote());

    await act(async () => {
      resolveCreate(createResponse());
      await savePromise;
    });

    // The stale create must NOT stamp the now-different blank quote.
    expect(screen.getByTestId('id').textContent).toBe('null');
    expect(screen.getByTestId('qno').textContent).toBe('');
  });

  it('a clean save (no mid-flight edit) stamps id/quote_no and flashes saved', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(createResponse()));
    render(
      <QuoteProvider initial={blankNoNumber()}>
        <Harness />
      </QuoteProvider>,
    );
    await act(async () => {
      await handle.current!.save();
    });
    expect(screen.getByTestId('id').textContent).toBe('uuid-1');
    expect(screen.getByTestId('qno').textContent).toBe('AW-260521-001');
    // No edit during the save → the persisted snapshot is still current → saved.
    expect(screen.getByTestId('status').textContent).toBe('saved');
  });
});
