// NotesSection — Session 3 behaviour tests.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { QuoteProvider, useQuoteState } from '../../../state/QuoteContext';
import { NotesSection } from './NotesSection';

function Probe(): React.ReactElement {
  const { state } = useQuoteState();
  return (
    <>
      <span data-testid="count">{state.notes.length}</span>
      <span data-testid="first">{state.notes[0] ?? ''}</span>
    </>
  );
}

function mount(): { user: ReturnType<typeof userEvent.setup> } {
  render(
    <QuoteProvider>
      <NotesSection />
      <Probe />
    </QuoteProvider>,
  );
  return { user: userEvent.setup() };
}

describe('NotesSection', () => {
  // createBlankQuote() seeds 3 default disclaimer notes (legacy parity), so a
  // fresh quote already shows 3 rows — NOT the empty hint.
  it('starts with the 3 seeded default notes', () => {
    mount();
    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
    expect(screen.getByText('3.')).toBeInTheDocument();
    expect(screen.getByLabelText('備註 1')).toBeInTheDocument();
  });

  it('shows the empty hint only after all notes are removed', async () => {
    const { user } = mount();
    // Remove from the end backwards so labels stay stable.
    await user.click(screen.getByRole('button', { name: '移除備註 3' }));
    await user.click(screen.getByRole('button', { name: '移除備註 2' }));
    await user.click(screen.getByRole('button', { name: '移除備註 1' }));
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByText(/按「\+ 新增」加備註/)).toBeInTheDocument();
  });

  it('"+ 新增" appends a 4th note row', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增' }));
    expect(screen.getByTestId('count').textContent).toBe('4');
    expect(screen.getByText('4.')).toBeInTheDocument();
    expect(screen.getByLabelText('備註 4')).toBeInTheDocument();
  });

  it('typing into a fresh note textarea updates state', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增' }));
    const ta = screen.getByLabelText('備註 4') as HTMLTextAreaElement;
    await user.type(ta, '需另增功能需另行報價');
    expect(ta.value).toBe('需另增功能需另行報價');
  });

  it('the ✕ button removes a note and renumbers the rest', async () => {
    const { user } = mount();
    expect(screen.getByTestId('count').textContent).toBe('3');

    await user.click(screen.getByRole('button', { name: '移除備註 2' }));
    expect(screen.getByTestId('count').textContent).toBe('2');
    // After removal, bullets remain sequential (the third becomes "2.").
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
    expect(screen.queryByText('3.')).not.toBeInTheDocument();
  });
});
