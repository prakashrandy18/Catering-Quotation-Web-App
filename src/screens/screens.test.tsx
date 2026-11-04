import { act, screen, within, fireEvent } from '@testing-library/react';

import { beforeEach, describe, expect, it } from 'vitest';
import { findSession, useAppStore } from '@/store/useAppStore';
import { renderApp, resetStore, sampleEvent, userEvent } from './testUtils';

beforeEach(() => {
  resetStore();
  window.localStorage.clear();
});

const sessionByName = (name: string) => {
  const e = sampleEvent();
  for (const d of e.days) for (const s of d.sessions) if (s.name === name) return s;
  throw new Error('no meal ' + name);
};

describe('Menu', () => {
  it('shows Price missing on unpriced meals and the right grand total', () => {
    const e = sampleEvent();
    renderApp(`/event/${e.id}/menu`);
    expect(screen.getByTestId('grand-total')).toHaveTextContent('₹85,000');
    // Day 1 has no prices at all
    const tiffin = screen.getByRole('link', { name: /Viratha Tiffin/ });
    expect(within(tiffin).getByText('Price missing')).toBeInTheDocument();
    expect(screen.getByText(/meals have no price yet/)).toBeInTheDocument();
    // Beverages are excluded
    expect(within(screen.getByRole('link', { name: /Evening Beverages/ })).getByText('Not included')).toBeInTheDocument();
  });

  it('switches day with the day buttons and remembers it in the address', async () => {
    const e = sampleEvent();
    renderApp(`/event/${e.id}/menu`);
    await userEvent.click(screen.getByRole('button', { name: /^26 Feb/ }));
    expect(screen.getByRole('link', { name: /Brunch/ })).toHaveTextContent('₹25,000');
    expect(screen.getByTestId('where')).toHaveTextContent(`day=${e.days[2].id}`);
  });

  it('adds a meal and opens its editor', async () => {
    const e = sampleEvent();
    renderApp(`/event/${e.id}/menu`);
    await userEvent.click(screen.getByRole('button', { name: 'Add a meal' }));
    expect(screen.getByRole('textbox', { name: 'Meal name' })).toHaveValue('New meal');
  });
});

describe('Meal editor', () => {
  it('+/- on people and price update the total (Brunch 120 x 260 = ₹31,200)', async () => {
    const e = sampleEvent();
    const brunch = sessionByName('Brunch');
    renderApp(`/event/${e.id}/menu/${brunch.id}`);
    expect(screen.getByTestId('session-total')).toHaveTextContent('₹25,000');
    await userEvent.click(screen.getByRole('button', { name: 'More People' }));
    await userEvent.click(screen.getByRole('button', { name: 'More People' }));
    await userEvent.click(screen.getByRole('button', { name: 'More Price per plate (leaf)' }));
    expect(screen.getByTestId('session-total')).toHaveTextContent('₹31,200');
    const now = findSession(sampleEvent(), brunch.id)!.session;
    expect(now.people).toBe(120);
    expect(now.pricing).toEqual({ mode: 'perLeaf', rate: 260 });
  });

  it('shows Price missing until a price is typed', async () => {
    const e = sampleEvent();
    const tiffin = sessionByName('Viratha Tiffin');
    renderApp(`/event/${e.id}/menu/${tiffin.id}`);
    expect(screen.getByTestId('session-total')).toHaveTextContent('Price missing');
    await userEvent.type(screen.getByLabelText('Price per plate (leaf)'), '237');
    expect(screen.getByTestId('session-total')).toHaveTextContent('₹23,700');
  });

  it('removes a dish with an Undo toast that brings it back', async () => {
    const e = sampleEvent();
    const brunch = sessionByName('Brunch');
    renderApp(`/event/${e.id}/menu/${brunch.id}`);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Curd Vadai' }));
    expect(findSession(sampleEvent(), brunch.id)!.session.entries.some((x) => x.text === 'Curd Vadai')).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('Removed Curd Vadai');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(findSession(sampleEvent(), brunch.id)!.session.entries.some((x) => x.text === 'Curd Vadai')).toBe(true);
  });

  it('reorders and renames dishes, adds blank space', async () => {
    const e = sampleEvent();
    const brunch = sessionByName('Brunch');
    renderApp(`/event/${e.id}/menu/${brunch.id}`);
    await userEvent.click(screen.getByRole('button', { name: 'Move Curd Vadai down' }));
    const texts = () => findSession(sampleEvent(), brunch.id)!.session.entries.map((x) => x.text);
    expect(texts().slice(2, 4)).toEqual(['Curd Pachadi', 'Curd Vadai']);
    await userEvent.click(screen.getByRole('button', { name: 'Rename Curd Vadai' }));
    const input = screen.getByRole('textbox', { name: 'Rename Curd Vadai' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Thayir Vadai{Enter}');
    expect(texts()).toContain('Thayir Vadai');
    const before = texts().length;
    await userEvent.click(screen.getByRole('button', { name: 'Add blank space' }));
    expect(texts().length).toBe(before + 1);
  });

  it('removes the meal after confirming', async () => {
    const e = sampleEvent();
    const kattu = sessionByName('Kattu Saatham');
    renderApp(`/event/${e.id}/menu/${kattu.id}`);
    await userEvent.click(screen.getByRole('button', { name: 'Remove this meal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }));
    expect(findSession(sampleEvent(), kattu.id)).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent(`/event/${e.id}/menu`);
  });
});

describe('Add dish', () => {
  it('search "sam" then tapping Samosa adds it', async () => {
    const e = sampleEvent();
    const snacks = sessionByName('Evening Snacks');
    // Samosa is already in Evening Snacks; use the tiffin meal instead
    const tiffin = sessionByName('Viratha Tiffin');
    void snacks;
    renderApp(`/event/${e.id}/menu/${tiffin.id}/add`);
    await userEvent.type(screen.getByLabelText('Search dishes'), 'sam');
    await userEvent.click(screen.getByRole('button', { name: 'Samosa' }));
    const entries = findSession(sampleEvent(), tiffin.id)!.session.entries;
    expect(entries[entries.length - 1].text).toBe('Samosa');
    expect(screen.getByRole('link', { name: /^Done · 1 added/ })).toBeInTheDocument();
    // tapping again removes what we added
    await userEvent.click(screen.getByRole('button', { name: 'Samosa' }));
    expect(findSession(sampleEvent(), tiffin.id)!.session.entries.some((x) => x.text === 'Samosa')).toBe(false);
  });

  it('marks dishes already in the meal', async () => {
    const e = sampleEvent();
    const snacks = sessionByName('Evening Snacks');
    renderApp(`/event/${e.id}/menu/${snacks.id}/add`);
    await userEvent.type(screen.getByLabelText('Search dishes'), 'samosa');
    expect(screen.getByText('Already added')).toBeInTheDocument();
  });

  it('asks about the spelling before saving a new dish', async () => {
    const e = sampleEvent();
    const tiffin = sessionByName('Viratha Tiffin');
    renderApp(`/event/${e.id}/menu/${tiffin.id}/add`);
    await userEvent.type(screen.getByLabelText('Search dishes'), 'vazhaipoo vadi');
    await userEvent.click(screen.getByRole('button', { name: /Save “vazhaipoo vadi” as a new dish/ }));
    expect(screen.getByText('Did you mean Vazhaipoo Vadai?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep as typed' }));
    const entries = findSession(sampleEvent(), tiffin.id)!.session.entries;
    expect(entries[entries.length - 1].text).toBe('Vazhaipoo Vadi');
    expect(useAppStore.getState().customDishes.map((d) => d.name)).toContain('Vazhaipoo Vadi');
  });
});

describe('History', () => {
  it('undoes a change and offers Redo', async () => {
    const e = sampleEvent();
    const brunch = sessionByName('Brunch');
    const st = useAppStore.getState();
    st.updateSession(e.id, brunch.id, { people: 120 });
    renderApp(`/event/${e.id}/history`);
    expect(screen.getByText('Current')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo this change' }));
    expect(findSession(sampleEvent(), brunch.id)!.session.people).toBe(100);
    expect(screen.getByRole('status')).toHaveTextContent('Undone: Brunch changed');
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(findSession(sampleEvent(), brunch.id)!.session.people).toBe(120);
  });

  it('asks before undoing an older change', async () => {
    const e = sampleEvent();
    const brunch = sessionByName('Brunch');
    const st = useAppStore.getState();
    st.updateSession(e.id, brunch.id, { people: 120 });
    st.updateSession(e.id, brunch.id, { name: 'Late Brunch' });
    renderApp(`/event/${e.id}/history`);
    const buttons = screen.getAllByRole('button', { name: 'Undo this change' });
    await userEvent.click(buttons[1]);
    expect(screen.getByText(/This also undoes the 1 change made after it/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, undo' }));
    expect(findSession(sampleEvent(), brunch.id)!.session.people).toBe(100);
    expect(findSession(sampleEvent(), brunch.id)!.session.name).toBe('Brunch');
  });

  it('shows an empty state', () => {
    const e = sampleEvent();
    renderApp(`/event/${e.id}/history`);
    expect(screen.getByText('No changes yet')).toBeInTheDocument();
  });
});

describe('New event', () => {
  const fill = async (name: string) => {
    await userEvent.type(screen.getByLabelText('Event name'), name);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2027-03-10' } });
  };

  it('asks for the missing details in plain words', async () => {
    renderApp('/new');
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(screen.getByText('Please type a name for this event.')).toBeInTheDocument();
    expect(screen.getByText('Please choose the first date.')).toBeInTheDocument();
  });

  it('copies days, meals and dishes of an old event onto the new dates', async () => {
    const old = sampleEvent();
    renderApp('/new');
    await fill('Ravi Wedding');
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2027-03-11' } });
    await userEvent.click(screen.getByLabelText('Copy an old event'));
    await userEvent.click(screen.getByRole('radio', { name: /Thara Wedding/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    const created = useAppStore.getState().events.find((x) => x.name === 'Ravi Wedding')!;
    expect(created).toBeTruthy();
    expect(created.days.map((d) => d.date)).toEqual(['10-03-2027', '11-03-2027']);
    expect(created.days[0].sessions.map((s) => s.name)).toEqual(old.days[0].sessions.map((s) => s.name));
    expect(created.days[0].sessions[0].entries.length).toBe(old.days[0].sessions[0].entries.length);
    expect(created.days[0].id).not.toBe(old.days[0].id);
    expect(created.days[0].sessions[0].id).not.toBe(old.days[0].sessions[0].id);
    expect(screen.getByTestId('where')).toHaveTextContent(`/event/${created.id}/menu`);
  });

  it('makes a blank event with one day per date', async () => {
    renderApp('/new');
    await fill('Blank One');
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2027-03-12' } });
    await userEvent.click(screen.getByLabelText('Blank'));
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    const created = useAppStore.getState().events.find((x) => x.name === 'Blank One')!;
    expect(created.days).toHaveLength(3);
    expect(created.days.every((d) => d.sessions.length === 0)).toBe(true);
  });

  it('refuses more than 10 days', async () => {
    renderApp('/new');
    await fill('Long One');
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2027-03-25' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(screen.getByText('An event can have at most 10 days.')).toBeInTheDocument();
  });
});

describe('Events home', () => {
  it('lists events, filters, and offers a backup', async () => {
    renderApp('/');
    expect(screen.getByRole('link', { name: /Thara Wedding/ })).toHaveAttribute('href', expect.stringMatching(/\/event\/.+\/menu$/));
    expect(screen.getByRole('link', { name: 'New event' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText(/prices? missing/)).toBeInTheDocument();
    expect(screen.getByText('Your events are saved on this phone only.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save backup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore backup' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sent' }));
    expect(screen.queryByRole('link', { name: /Thara Wedding/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await userEvent.type(screen.getByLabelText('Search events'), 'avadi');
    expect(screen.getByRole('link', { name: /Thara Wedding/ })).toBeInTheDocument();
  });

  it('duplicates, marks and deletes from the more menu', async () => {
    renderApp('/');
    await userEvent.click(screen.getByRole('button', { name: 'More for Thara Wedding' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Sent' }));
    expect(useAppStore.getState().events[0].status).toBe('sent');
    await userEvent.click(screen.getByRole('button', { name: 'More for Thara Wedding' }));
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    const nameBox = screen.getByLabelText('Name for the copy');
    await userEvent.clear(nameBox);
    await userEvent.type(nameBox, 'Thara Reception');
    await userEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    expect(useAppStore.getState().events.map((x) => x.name)).toContain('Thara Reception');
    await userEvent.click(screen.getByRole('button', { name: 'More for Thara Reception' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await act(async () => {
      await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    });
    expect(useAppStore.getState().events.map((x) => x.name)).not.toContain('Thara Reception');
  });
});
