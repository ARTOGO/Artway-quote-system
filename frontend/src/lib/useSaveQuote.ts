// Save the current quote to the cloud (Postgres via the Go API).
//
// A brand-new quote has no id and no quote_no — the backend allocates the serial
// at save time (not on Builder mount), so refreshing an unsaved quote never
// burns a number. The create response carries both the id and the assigned
// quote_no; both are stamped into state so the number shows in the preview /
// PDF immediately. Once a quote has an id, subsequent saves PUT-update it.

import { useCallback, useRef, useState } from 'react';

import { createQuote, updateQuote, type CreateResult, type SaveResult } from '../api/quotes';
import { useQuoteState } from '../state/QuoteContext';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseSaveQuote {
  save: () => Promise<SaveResult>;
  status: SaveStatus;
  reset: () => void;
}

export function useSaveQuote(): UseSaveQuote {
  const { state, dispatch, getQuoteInstance } = useQuoteState();
  const [status, setStatus] = useState<SaveStatus>('idle');
  // Dedupe concurrent saves (a new quote has no id yet, so two overlapping
  // saves would both create + burn serials) — return the in-flight promise.
  const inFlight = useRef<Promise<SaveResult> | null>(null);
  // Latest committed state, used ONLY for the success-status dirty check: if the
  // user edited a field while the save was in flight, the request body used the
  // older snapshot, so we must not flash 已存到雲端 for content that wasn't
  // persisted (Codex P2-B). The id / quote_no stamp is separate (keyed off the
  // quote instance below), so we still never double-create. Updated every render.
  const latestState = useRef(state);
  latestState.current = state;

  const save = useCallback((): Promise<SaveResult> => {
    if (inFlight.current) return inFlight.current;
    setStatus('saving');
    const snapshot = state;
    const forQuoteNo = snapshot.meta.quoteNo;
    const isCreate = !snapshot.id;
    // Capture the quote *instance*, not the state object. Field edits keep the
    // same instance, so a create that resolves AFTER an in-place edit still
    // stamps the id / quote_no — otherwise local state keeps id=null and the
    // next save POSTs a second row + burns a second serial (Codex P2-1). A
    // 新報價 / load mid-create bumps the instance, so that stale stamp (which
    // would land on the now-different quote) is correctly skipped.
    const startInstance = getQuoteInstance();
    const sameInstance = (): boolean => getQuoteInstance() === startInstance;
    const p = (async (): Promise<SaveResult> => {
      try {
        const res = snapshot.id
          ? await updateQuote(snapshot.id, snapshot)
          : await createQuote(snapshot);
        if (sameInstance()) {
          // Stamp the server id / quote_no regardless of any mid-flight edit —
          // the row was created for THIS quote instance, so capturing its id
          // stops the next save POSTing a 2nd row (Codex P2-1). create → also
          // stamp the quote_no so the number shows in the preview + PDF.
          const quoteNo = isCreate ? (res as CreateResult).quote_no : undefined;
          dispatch({ type: 'SET_SAVED', id: res.id, forQuoteNo, quoteNo });
          // Only flash success if the saved snapshot is still the latest state.
          // An edit during the in-flight save means the newest content was NOT
          // persisted, so stay at 存到雲端 (idle) to prompt a re-save instead of
          // falsely claiming 已存到雲端 (Codex P2-B).
          setStatus(latestState.current === snapshot ? 'saved' : 'idle');
        } else {
          setStatus('idle');
        }
        return res;
      } catch (err) {
        setStatus(sameInstance() ? 'error' : 'idle');
        throw err;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = p;
    return p;
  }, [state, dispatch, getQuoteInstance]);

  const reset = useCallback(() => setStatus('idle'), []);

  return { save, status, reset };
}
