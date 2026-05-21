// React Context wrapping the quote reducer.
//
// API:
//   <QuoteProvider initial={...}>...</QuoteProvider>
//   const { state, dispatch, setMeta, setClient, setSales, setStatus, ... } = useQuoteState();
//
// Wrapper helpers (`setMeta` etc) exist so section components stay concise
// and don't repeat the `dispatch({ type: 'SET_META', field, value })`
// boilerplate at every <input onChange>.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type JSX,
  type ReactNode,
} from 'react';

import { createBlankQuote, quoteReducer } from './quoteReducer';
import type {
  Quote,
  QuoteAction,
  QuoteAdjustment,
  QuoteClient,
  QuoteGroup,
  QuoteItem,
  QuoteMeta,
  QuotePayment,
  QuoteSales,
  QuoteService,
  QuoteStatus,
} from './quoteTypes';

interface QuoteContextValue {
  state: Quote;
  dispatch: Dispatch<QuoteAction>;

  setStatus: (status: QuoteStatus) => void;
  setQuoteNo: (quoteNo: string) => void;
  setMeta: (field: keyof QuoteMeta, value: string) => void;
  setClient: (field: keyof QuoteClient, value: string) => void;
  setSales: (field: keyof QuoteSales, value: string) => void;
  reset: (quote?: Quote) => void;
  load: (quote: Quote) => void;

  // ─── Groups (Session 2) ────────────────────────────────────────────────
  addGroup: (group: QuoteGroup) => void;
  removeGroup: (gid: string) => void;
  renameGroup: (gid: string, title: string) => void;
  addItem: (gid: string, item: QuoteItem) => void;
  removeItem: (gid: string, itemId: string) => void;
  updateItem: (gid: string, itemId: string, patch: Partial<Omit<QuoteItem, 'id'>>) => void;
  moveItem: (gid: string, fromIndex: number, toIndex: number) => void;

  // ─── Group discount / adjustment (Session 2.5) ─────────────────────────
  setGroupDiscount: (gid: string, hasDiscount: boolean) => void;
  setGroupAutoDiscount: (gid: string, autoDiscount: boolean) => void;
  setGroupAdjustmentEnabled: (gid: string, hasAdjustment: boolean) => void;
  setGroupAdjustment: (gid: string, field: keyof QuoteAdjustment, value: string) => void;

  // ─── Services (02 服務說明摘要) ─────────────────────────────────────────
  updateService: (
    sub_group: string,
    patch: Partial<Pick<QuoteService, 'summary' | 'includeAppendix'>>,
  ) => void;

  // ─── Deliverables / Notes / Payment (Session 3) ────────────────────────
  addDeliverable: (value?: string) => void;
  updateDeliverable: (index: number, value: string) => void;
  removeDeliverable: (index: number) => void;
  addNote: (value?: string) => void;
  updateNote: (index: number, value: string) => void;
  removeNote: (index: number) => void;
  setPayment: (field: keyof QuotePayment, value: string) => void;

  // ─── Quote-number allocation side-channel (Codex F10/F14) ──────────────
  // BuilderPanel's allocation effect depends on `fetchToken`; bumping it
  // forces React to re-run the effect even when state.meta.quoteNo is
  // already `''` (e.g. after a fetch failure, or after `newQuote()` when
  // the previous quote was also unnumbered). Without this side-channel,
  // `'' === ''` causes the dep array to look identical and the effect
  // never re-fires.
  fetchToken: number;
  /** Re-run the allocation effect without clearing state (Retry path). */
  retry: () => void;
  /** Reset state to a blank quote AND request a fresh allocation. */
  newQuote: () => void;

  // ─── Date-init flag (Codex F11 / F13 / F15) ────────────────────────────
  // Tracks whether BuilderPanel has already auto-populated the
  // issue/valid dates for the current blank quote. Once true, retries
  // and Builder remounts skip the date refresh — preserving any user
  // edits (past, future, or anything else). `newQuote()` flips this back
  // to false so a fresh quote always gets fresh dates.
  datesInitialised: boolean;
  markDatesInitialised: () => void;
}

const QuoteContext = createContext<QuoteContextValue | null>(null);

interface QuoteProviderProps {
  children: ReactNode;
  initial?: Quote;
}

export function QuoteProvider({ children, initial }: QuoteProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(
    quoteReducer,
    initial ?? null,
    (seed) => seed ?? createBlankQuote(),
  );

  const setStatus = useCallback(
    (status: QuoteStatus) => dispatch({ type: 'SET_STATUS', status }),
    [],
  );
  const setQuoteNo = useCallback(
    (quoteNo: string) => dispatch({ type: 'SET_QUOTE_NO', quoteNo }),
    [],
  );
  const setMeta = useCallback(
    (field: keyof QuoteMeta, value: string) => dispatch({ type: 'SET_META', field, value }),
    [],
  );
  const setClient = useCallback(
    (field: keyof QuoteClient, value: string) => dispatch({ type: 'SET_CLIENT', field, value }),
    [],
  );
  const setSales = useCallback(
    (field: keyof QuoteSales, value: string) => dispatch({ type: 'SET_SALES', field, value }),
    [],
  );
  const reset = useCallback(
    (quote?: Quote) => dispatch({ type: 'RESET', quote: quote ?? createBlankQuote() }),
    [],
  );
  const load = useCallback((quote: Quote) => dispatch({ type: 'LOAD', quote }), []);

  // ─── Groups (Session 2) ────────────────────────────────────────────────
  const addGroup = useCallback((group: QuoteGroup) => dispatch({ type: 'ADD_GROUP', group }), []);
  const removeGroup = useCallback((gid: string) => dispatch({ type: 'REMOVE_GROUP', gid }), []);
  const renameGroup = useCallback(
    (gid: string, title: string) => dispatch({ type: 'RENAME_GROUP', gid, title }),
    [],
  );
  const addItem = useCallback(
    (gid: string, item: QuoteItem) => dispatch({ type: 'ADD_ITEM', gid, item }),
    [],
  );
  const removeItem = useCallback(
    (gid: string, itemId: string) => dispatch({ type: 'REMOVE_ITEM', gid, itemId }),
    [],
  );
  const updateItem = useCallback(
    (gid: string, itemId: string, patch: Partial<Omit<QuoteItem, 'id'>>) =>
      dispatch({ type: 'UPDATE_ITEM', gid, itemId, patch }),
    [],
  );
  const moveItem = useCallback(
    (gid: string, fromIndex: number, toIndex: number) =>
      dispatch({ type: 'MOVE_ITEM', gid, fromIndex, toIndex }),
    [],
  );

  // ─── Group discount / adjustment (Session 2.5) ─────────────────────────
  const setGroupDiscount = useCallback(
    (gid: string, hasDiscount: boolean) =>
      dispatch({ type: 'SET_GROUP_DISCOUNT', gid, hasDiscount }),
    [],
  );
  const setGroupAutoDiscount = useCallback(
    (gid: string, autoDiscount: boolean) =>
      dispatch({ type: 'SET_GROUP_AUTO_DISCOUNT', gid, autoDiscount }),
    [],
  );
  const setGroupAdjustmentEnabled = useCallback(
    (gid: string, hasAdjustment: boolean) =>
      dispatch({ type: 'SET_GROUP_ADJUSTMENT_ENABLED', gid, hasAdjustment }),
    [],
  );
  const setGroupAdjustment = useCallback(
    (gid: string, field: keyof QuoteAdjustment, value: string) =>
      dispatch({ type: 'SET_GROUP_ADJUSTMENT', gid, field, value }),
    [],
  );

  // ─── Services (02 服務說明摘要) ─────────────────────────────────────────
  const updateService = useCallback(
    (sub_group: string, patch: Partial<Pick<QuoteService, 'summary' | 'includeAppendix'>>) =>
      dispatch({ type: 'UPDATE_SERVICE', sub_group, patch }),
    [],
  );

  // ─── Deliverables / Notes / Payment (Session 3) ────────────────────────
  const addDeliverable = useCallback(
    (value?: string) => dispatch({ type: 'ADD_DELIVERABLE', value }),
    [],
  );
  const updateDeliverable = useCallback(
    (index: number, value: string) => dispatch({ type: 'UPDATE_DELIVERABLE', index, value }),
    [],
  );
  const removeDeliverable = useCallback(
    (index: number) => dispatch({ type: 'REMOVE_DELIVERABLE', index }),
    [],
  );
  const addNote = useCallback((value?: string) => dispatch({ type: 'ADD_NOTE', value }), []);
  const updateNote = useCallback(
    (index: number, value: string) => dispatch({ type: 'UPDATE_NOTE', index, value }),
    [],
  );
  const removeNote = useCallback((index: number) => dispatch({ type: 'REMOVE_NOTE', index }), []);
  const setPayment = useCallback(
    (field: keyof QuotePayment, value: string) => dispatch({ type: 'SET_PAYMENT', field, value }),
    [],
  );

  // ─── Allocation side-channel (Codex F10 / F14) ─────────────────────────
  const [fetchToken, setFetchToken] = useState(0);
  const retry = useCallback(() => setFetchToken((n) => n + 1), []);

  // ─── Date-init flag (Codex F11 / F13 / F15) ────────────────────────────
  const [datesInitialised, setDatesInitialised] = useState(false);
  const markDatesInitialised = useCallback(() => setDatesInitialised(true), []);

  const newQuote = useCallback(() => {
    dispatch({ type: 'RESET', quote: createBlankQuote() });
    setFetchToken((n) => n + 1);
    setDatesInitialised(false); // fresh quote → fresh dates allowed
  }, []);

  const value = useMemo<QuoteContextValue>(
    () => ({
      state,
      dispatch,
      setStatus,
      setQuoteNo,
      setMeta,
      setClient,
      setSales,
      reset,
      load,
      addGroup,
      removeGroup,
      renameGroup,
      addItem,
      removeItem,
      updateItem,
      moveItem,
      setGroupDiscount,
      setGroupAutoDiscount,
      setGroupAdjustmentEnabled,
      setGroupAdjustment,
      updateService,
      addDeliverable,
      updateDeliverable,
      removeDeliverable,
      addNote,
      updateNote,
      removeNote,
      setPayment,
      fetchToken,
      retry,
      newQuote,
      datesInitialised,
      markDatesInitialised,
    }),
    [
      state,
      setStatus,
      setQuoteNo,
      setMeta,
      setClient,
      setSales,
      reset,
      load,
      addGroup,
      removeGroup,
      renameGroup,
      addItem,
      removeItem,
      updateItem,
      moveItem,
      setGroupDiscount,
      setGroupAutoDiscount,
      setGroupAdjustmentEnabled,
      setGroupAdjustment,
      updateService,
      addDeliverable,
      updateDeliverable,
      removeDeliverable,
      addNote,
      updateNote,
      removeNote,
      setPayment,
      fetchToken,
      retry,
      newQuote,
      datesInitialised,
      markDatesInitialised,
    ],
  );

  return <QuoteContext.Provider value={value}>{children}</QuoteContext.Provider>;
}

/**
 * Throws if used outside <QuoteProvider>. Better than returning null and
 * forcing every consumer to add a guard.
 */
export function useQuoteState(): QuoteContextValue {
  const ctx = useContext(QuoteContext);
  if (ctx === null) {
    throw new Error('useQuoteState must be used inside <QuoteProvider>');
  }
  return ctx;
}
