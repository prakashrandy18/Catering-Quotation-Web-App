import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { grandTotal } from '@/lib/calc';
import ChatScreen from '../ChatScreen';
import { chatMessages, confirmProposal, declineProposal, sendMessage, setSpellingChoice, undoProposal } from '../actions';
import { apiMessage, currentEvent, jsonResponse, meal, mockFetch, requestBody, resetStore } from './helpers';
import type { ProposalCard } from '../chatTypes';

function proposeSwap(sessionId: string) {
  return apiMessage([
    { type: 'text', text: 'Here is the change for Muhurtham Morning Tiffin:' },
    {
      type: 'tool_use',
      id: 'toolu_swap',
      name: 'propose_changes',
      input: {
        summary: 'Swap Vada Curry for Poori Masala Kilangu',
        operations: [
          { op: 'remove_dishes', session_id: sessionId, dishes: ['Vada Curry'] },
          { op: 'add_dishes', session_id: sessionId, dishes: [{ name: 'Poori Masala Kilangu' }] },
        ],
      },
    },
  ]);
}

const lastCard = (eventId: string) => {
  const m = [...chatMessages(eventId)].reverse().find((x) => x.card);
  return { msg: m!, card: m!.card! };
};

describe('turn loop with a mocked API', () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('propose_changes → preview card; nothing changes until Yes; one claude history entry; Undo restores', async () => {
    const event = currentEvent();
    const tiffin = meal(event, 'Muhurtham Morning Tiffin');
    const fetchMock = mockFetch(
      () => jsonResponse(proposeSwap(tiffin.id)),
      () => jsonResponse(apiMessage([{ type: 'text', text: 'Okay.' }], 'end_turn')),
    );
    const before = JSON.stringify(currentEvent().days);
    const historyBefore = useAppStore.getState().history.length;

    expect(await sendMessage(event.id, 'muhurtham tiffin la vada curry ku pathila poori masala kilangu')).toBe('sent');

    // request shape
    const body = requestBody(fetchMock, 0);
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.max_tokens).toBe(4096);
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.tool_choice).toEqual({ type: 'auto' });
    expect(body.fallbacks).toBe('default');
    const userContent = (body.messages as { content: { type: string; text?: string }[] }[])[0].content;
    expect(userContent[0].text).toContain(`MEAL ${tiffin.id}`);
    expect(userContent[1].text).toBe('muhurtham tiffin la vada curry ku pathila poori masala kilangu');
    const headers = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(headers.get('authorization')).toBe('Bearer sk-ant-test');

    // card shown, store untouched
    const { msg, card } = lastCard(event.id);
    expect(card.kind).toBe('proposal');
    expect((card as ProposalCard).status).toBe('pending');
    expect(JSON.stringify(currentEvent().days)).toBe(before);
    expect(useAppStore.getState().history.length).toBe(historyBefore);
    expect(chatMessages(event.id).some((m) => m.text === 'Here is the change for Muhurtham Morning Tiffin:')).toBe(true);

    // Yes → one history entry by claude
    expect(confirmProposal(event.id, msg.id)).toBe(true);
    const history = useAppStore.getState().history;
    expect(history.length).toBe(historyBefore + 1);
    expect(history[0].by).toBe('claude');
    expect(history[0].summary).toBe('Muhurtham Morning Tiffin updated');
    expect(history[0].detail).toContain('Removed: Vada Curry');
    const dishes = meal(currentEvent(), 'Muhurtham Morning Tiffin').entries.map((e) => e.text);
    expect(dishes).not.toContain('Vada Curry');
    expect(dishes).toContain('Poori Masala Kilangu');
    const applied = lastCard(event.id).card as ProposalCard;
    expect(applied.status).toBe('applied');
    expect(applied.preview?.sections[0].removed).toEqual(['Vada Curry']);
    expect(applied.dayId).toBe(event.days[1].id);

    // the decision goes back to Claude as the tool_result with the next user turn
    await sendMessage(event.id, 'thanks');
    const next = requestBody(fetchMock, 1).messages as { role: string; content: { type: string; tool_use_id?: string; content?: string }[] }[];
    expect(next).toHaveLength(3);
    const tr = next[2].content[0];
    expect(tr.type).toBe('tool_result');
    expect(tr.tool_use_id).toBe('toolu_swap');
    expect(tr.content).toContain('tapped "Yes"');

    // Undo restores exactly
    expect(undoProposal(event.id, msg.id)).toBe(true);
    expect(JSON.stringify(currentEvent().days)).toBe(before);
    expect((lastCard(event.id).card as ProposalCard).status).toBe('undone');
  });

  it('No, change it leaves the menu as it was and tells Claude', async () => {
    const event = currentEvent();
    const tiffin = meal(event, 'Muhurtham Morning Tiffin');
    const fetchMock = mockFetch(
      () => jsonResponse(proposeSwap(tiffin.id)),
      () => jsonResponse(apiMessage([{ type: 'text', text: 'Sure, what should change?' }], 'end_turn')),
    );
    const before = JSON.stringify(currentEvent());
    await sendMessage(event.id, 'swap it');
    declineProposal(event.id, lastCard(event.id).msg.id);
    expect(JSON.stringify(currentEvent())).toBe(before);
    await sendMessage(event.id, 'no, keep vada curry');
    const next = requestBody(fetchMock, 1).messages as { content: { content?: string }[] }[];
    expect(next[2].content[0].content).toContain('No, change it');
  });

  it('tool errors go back to Claude as is_error results before anything is shown', async () => {
    const event = currentEvent();
    const tiffin = meal(event, 'Muhurtham Morning Tiffin');
    const fetchMock = mockFetch(
      () =>
        jsonResponse(
          apiMessage([
            { type: 'tool_use', id: 'toolu_bad', name: 'propose_changes', input: { summary: 'x', operations: [{ op: 'remove_dishes', session_id: 'se_wrong', dishes: ['Vada Curry'] }] } },
          ]),
        ),
      () => jsonResponse(proposeSwap(tiffin.id)),
    );
    await sendMessage(event.id, 'remove vada curry');
    const second = requestBody(fetchMock, 1).messages as { content: { type: string; is_error?: boolean; content?: string }[] }[];
    const result = second[2].content[0];
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('Unknown session_id "se_wrong"');
    expect(chatMessages(event.id).filter((m) => m.card?.kind === 'proposal')).toHaveLength(1);
  });

  it('spelling: "Keep as typed" is used, remembered and saved as a dish', async () => {
    const event = currentEvent();
    const snacks = meal(event, 'Evening Snacks');
    mockFetch(() =>
      jsonResponse(
        apiMessage([
          {
            type: 'tool_use',
            id: 'toolu_sp',
            name: 'propose_changes',
            input: { summary: 'Add Mini Bahadur Shah', operations: [{ op: 'add_dishes', session_id: snacks.id, dishes: [{ name: 'Mini Bahadur Shah' }] }] },
          },
        ]),
      ),
    );
    await sendMessage(event.id, 'evening snacks la mini bahadur shah add pannu');
    const { msg, card } = lastCard(event.id);
    expect((card as ProposalCard).spelling[0]).toMatchObject({ typed: 'Mini Bahadur Shah', suggestion: 'Mini Badusha' });
    setSpellingChoice(event.id, msg.id, 'mini bahadur shah', 'typed');
    expect(useAppStore.getState().meta.spellingMemory['mini bahadur shah']).toBe('Mini Bahadur Shah');
    expect(useAppStore.getState().customDishes.map((d) => d.name)).toContain('Mini Bahadur Shah');
    expect(confirmProposal(event.id, msg.id)).toBe(true);
    expect(meal(currentEvent(), 'Evening Snacks').entries.map((e) => e.text)).toContain('Mini Bahadur Shah');
  });

  it('401 → friendly error with Settings link, nothing changed, text kept for Try again', async () => {
    const event = currentEvent();
    mockFetch(() => jsonResponse({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401));
    const total = grandTotal(currentEvent());
    expect(await sendMessage(event.id, 'brunch 120 per')).toBe('failed');
    const { msg, card } = lastCard(event.id);
    expect(msg.text).toBe('The Claude key was not accepted — check Settings.');
    expect(card).toMatchObject({ kind: 'error', errorKind: 'auth', retryText: 'brunch 120 per', settings: true });
    expect(grandTotal(currentEvent())).toBe(total);
  });

  it('429 → busy message', async () => {
    const event = currentEvent();
    const busy = () => jsonResponse({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 429);
    mockFetch(busy, busy);
    useAppStore.getState().updateAssistant({ apiKey: 'sk-ant-test' });
    await sendMessage(event.id, 'hi');
    expect(lastCard(event.id).msg.text).toBe('Claude is busy, try again in a minute.');
  }, 20_000);

  it('no key / offline are refused before any request', async () => {
    const event = currentEvent();
    const fetchMock = mockFetch();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await sendMessage(event.id, 'hi')).toBe('offline');
    vi.restoreAllMocks();
    useAppStore.getState().updateAssistant({ apiKey: '' });
    expect(await sendMessage(event.id, 'hi')).toBe('no-key');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ChatScreen', () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderChat(path?: string) {
    const event = currentEvent();
    function Layout() {
      const e = useAppStore((s) => s.events.find((x) => x.id === event.id))!;
      return <Outlet context={{ event: e }} />;
    }
    render(
      <MemoryRouter initialEntries={[path ?? `/event/${event.id}/chat`]}>
        <Routes>
          <Route path="/event/:eventId" element={<Layout />}>
            <Route path="chat" element={<ChatScreen />} />
            <Route path="menu" element={<div>Menu screen</div>} />
          </Route>
          <Route path="/settings" element={<div>Settings screen</div>} />
        </Routes>
      </MemoryRouter>,
    );
    return event;
  }

  it('ask_choice renders tappable options; tapping sends the choice as the next message', async () => {
    const event = currentEvent();
    const l1 = meal(event, 'Viratha Lunch');
    const l2 = meal(event, 'Muhurtham Lunch');
    const fetchMock = mockFetch(
      () =>
        jsonResponse(
          apiMessage([
            {
              type: 'tool_use',
              id: 'toolu_ask',
              name: 'ask_choice',
              input: {
                question: 'Which lunch?',
                options: [
                  { label: 'Day 1 · Viratha Lunch', value: l1.id },
                  { label: 'Day 2 · Muhurtham Lunch', value: l2.id },
                ],
              },
            },
          ]),
        ),
      () => jsonResponse(apiMessage([{ type: 'text', text: 'Got it.' }], 'end_turn')),
    );
    renderChat();
    fireEvent.change(screen.getByLabelText('Message Claude'), { target: { value: 'lunch la payasam add pannu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const option = await screen.findByRole('button', { name: 'Day 2 · Muhurtham Lunch' });
    expect(screen.getByRole('button', { name: 'Day 1 · Viratha Lunch' })).toBeInTheDocument();
    const before = JSON.stringify(currentEvent());
    await act(async () => {
      fireEvent.click(option);
    });
    await screen.findByText('Got it.');
    expect(JSON.stringify(currentEvent())).toBe(before);
    const msgs = requestBody(fetchMock, 1).messages as { content: { type: string; text?: string; content?: string }[] }[];
    expect(msgs[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_ask' });
    expect(msgs[2].content[0].content).toContain('Day 2 · Muhurtham Lunch');
    expect(msgs[2].content[2].text).toBe('Day 2 · Muhurtham Lunch');
  });

  it('preview card shows Removed / Added and "Yes, do it" applies it', async () => {
    const event = currentEvent();
    mockFetch(() => jsonResponse(proposeSwap(meal(event, 'Muhurtham Morning Tiffin').id)));
    renderChat(`/event/${event.id}/chat?draft=${encodeURIComponent('vada curry ku pathila poori masala kilangu')}`);
    expect(screen.getByLabelText('Message Claude')).toHaveValue('vada curry ku pathila poori masala kilangu');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('button', { name: 'Yes, do it' });
    expect(screen.getByText('Removed:')).toBeInTheDocument();
    expect(screen.getByText('Added:')).toBeInTheDocument();
    expect(screen.getByText('Day 2 · Muhurtham Morning Tiffin · 300 people')).toBeInTheDocument();
    expect(screen.getByTestId('proposal-total')).toHaveTextContent('Total unchanged · ₹85,000');
    fireEvent.click(screen.getByRole('button', { name: 'Yes, do it' }));
    await screen.findByRole('button', { name: 'Undo' });
    expect(screen.getByRole('link', { name: 'Show in menu' })).toHaveAttribute('href', `/event/${event.id}/menu?day=${event.days[1].id}`);
    await waitFor(() => expect(meal(currentEvent(), 'Muhurtham Morning Tiffin').entries.map((e) => e.text)).toContain('Poori Masala Kilangu'));
  });

  it('shows the setup card when there is no key', () => {
    useAppStore.getState().updateAssistant({ apiKey: '' });
    renderChat();
    expect(screen.getByText('Claude is not set up on this phone yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByLabelText('Message Claude')).not.toBeInTheDocument();
  });

  it('401 shows the friendly error in the chat', async () => {
    mockFetch(() => jsonResponse({ type: 'error', error: { type: 'authentication_error', message: 'bad key' } }, 401));
    renderChat();
    fireEvent.change(screen.getByLabelText('Message Claude'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('The Claude key was not accepted — check Settings.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
