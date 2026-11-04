import { render } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAppStore, useEvent } from '@/store/useAppStore';
import { Toaster } from '@/components/ui/Toaster';
import { useToastStore } from '@/store/toast';
import type { EventOutletContext } from '@/components/EventLayout';
import MenuScreen from './MenuScreen';
import SessionScreen from './SessionScreen';
import AddDishScreen from './AddDishScreen';
import HistoryScreen from './HistoryScreen';
import EventsScreen from './EventsScreen';
import NewEventScreen from './NewEventScreen';

/** Stand-in for EventLayout (no PDF pane): hands the event to nested screens. */
function EventShell() {
  const { eventId } = useParams();
  const event = useEvent(eventId);
  if (!event) return <p>Event not found</p>;
  return <Outlet context={{ event } satisfies EventOutletContext} />;
}

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

export function resetStore() {
  useAppStore.getState().resetToSample();
  useToastStore.setState({ toasts: [] });
}

export function sampleEvent() {
  return useAppStore.getState().events[0];
}

export function renderApp(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<EventsScreen />} />
        <Route path="/new" element={<NewEventScreen />} />
        <Route path="/event/:eventId" element={<EventShell />}>
          <Route path="menu" element={<MenuScreen />} />
          <Route path="menu/:sessionId" element={<SessionScreen />} />
          <Route path="menu/:sessionId/add" element={<AddDishScreen />} />
          <Route path="history" element={<HistoryScreen />} />
          <Route path="chat" element={<p>chat</p>} />
          <Route path="pdf" element={<p>pdf</p>} />
        </Route>
      </Routes>
      <Where />
      <Toaster />
    </MemoryRouter>,
  );
}

/** Tiny stand-in for @testing-library/user-event (not installed): click / type / clear via fireEvent. */
import { fireEvent } from '@testing-library/react';
export const userEvent = {
  async click(el: Element) {
    fireEvent.click(el);
  },
  async clear(el: Element) {
    fireEvent.change(el, { target: { value: '' } });
  },
  async type(el: Element, text: string) {
    let value = (el as HTMLInputElement).value;
    for (const token of text.split(/(\{Enter\})/)) {
      if (token === '{Enter}') fireEvent.keyDown(el, { key: 'Enter' });
      else
        for (const ch of token) {
          value += ch;
          fireEvent.change(el, { target: { value } });
        }
    }
  },
};
