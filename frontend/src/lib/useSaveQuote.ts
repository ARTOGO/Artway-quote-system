// Save the current quote to the cloud (Postgres via the Go API).
//
// Mirrors legacy saveToCloud (legacy.html:3047): a brand-new quote (no id yet)
// is created (POST); once it carries a backend id, subsequent saves update it
// (PUT). The returned id is stamped back into state (SET_SAVED) so the next
// save targets the same row instead of inserting a duplicate.

import { useCallback, useRef, useState } from 'react';

import { createQuote, updateQuote, type SaveResult } from '../api/quotes';
import { useQuoteState } from '../state/QuoteContext';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveOptions {
  /**
   * Stamp the returned id into state immediately (default true). The two-stage
   * print flow passes `false` so the SET_SAVED re-render — which would discard
   * DOM-only edit-mode tweaks — happens AFTER the PDF is captured, not before
   * (Codex P2). The caller is responsible for stamping later.
   */
  stamp?: boolean;
}

export interface UseSaveQuote {
  save: (opts?: SaveOptions) => Promise<SaveResult>;
  status: SaveStatus;
  reset: () => void;
}

export function useSaveQuote(): UseSaveQuote {
  const { state, dispatch } = useQuoteState();
  const [status, setStatus] = useState<SaveStatus>('idle');
  // Dedupe concurrent saves: a brand-new quote has no id yet, so two overlapping
  // saves (e.g. clicking 存到雲端 then 輸出 PDF before the first POST returns)
  // would both create, sending duplicate quote_no → backend conflict. Return the
  // same in-flight promise instead of issuing a second request (Codex P2).
  const inFlight = useRef<Promise<SaveResult> | null>(null);
  // Latest state object, so a save that resolves AFTER the user switched quotes
  // (新報價 / load) OR edited any field doesn't flash 已存到雲端 on now-unsaved
  // content. The reducer returns a NEW state object on every change, so object
  // identity is an exact "nothing changed since the snapshot we persisted"
  // check — stricter than comparing quote_no alone (Codex P2). Updated每 render.
  const latestState = useRef(state);
  latestState.current = state;

  const save = useCallback(
    (opts?: SaveOptions): Promise<SaveResult> => {
      if (inFlight.current) return inFlight.current;
      const shouldStamp = opts?.stamp !== false;
      setStatus('saving');
      // Exact snapshot being persisted + its quote identity (the reducer drops
      // the id stamp if the user switched quotes mid-save — SET_SAVED, Codex P1).
      const snapshot = state;
      const forQuoteNo = state.meta.quoteNo;
      const p = (async (): Promise<SaveResult> => {
        try {
          const res = snapshot.id
            ? await updateQuote(snapshot.id, snapshot)
            : await createQuote(snapshot);
          // Was anything edited / switched while the request was in flight? (The
          // SET_SAVED dispatch below mutates state, so check BEFORE dispatching.)
          const stillCurrent = latestState.current === snapshot;
          if (shouldStamp) dispatch({ type: 'SET_SAVED', id: res.id, forQuoteNo });
          setStatus(stillCurrent ? 'saved' : 'idle');
          return res;
        } catch (err) {
          setStatus(latestState.current === snapshot ? 'error' : 'idle');
          throw err;
        } finally {
          inFlight.current = null;
        }
      })();
      inFlight.current = p;
      return p;
    },
    [state, dispatch],
  );

  const reset = useCallback(() => setStatus('idle'), []);

  return { save, status, reset };
}
