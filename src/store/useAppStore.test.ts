import { useAppStore, findSession } from '@/store/useAppStore';
import { sessionTotal } from '@/lib/calc';

const s = () => useAppStore.getState();

beforeEach(() => {
  localStorage.clear();
  s().resetToSample();
});

describe('store', () => {
  it('records history and undoes a dish swap', () => {
    const ev = s().events[0];
    const tiffin = ev.days[0].sessions[0];
    const target = tiffin.entries.find((x) => x.text === 'Coffee')!;
    s().removeEntry(ev.id, tiffin.id, target.id);
    s().addEntry(ev.id, tiffin.id, { text: 'Filter Coffee' });
    let cur = s().events[0];
    expect(findSession(cur, tiffin.id)!.session.entries.map((x) => x.text)).toContain('Filter Coffee');
    expect(s().history.filter((h) => h.eventId === ev.id)).toHaveLength(2);
    // undo the removal → state before removal (Coffee back, Filter Coffee gone)
    const removal = s().history[1];
    s().undo(removal.id);
    cur = s().events[0];
    const names = findSession(cur, tiffin.id)!.session.entries.map((x) => x.text);
    expect(names).toContain('Coffee');
    expect(names).not.toContain('Filter Coffee');
    // undo the undo = redo
    s().undo(s().history[0].id);
    expect(findSession(s().events[0], tiffin.id)!.session.entries.map((x) => x.text)).toContain('Filter Coffee');
  });

  it('coalesces rapid edits of the same field', () => {
    const ev = s().events[0];
    const brunch = ev.days[2].sessions[0];
    s().updateSession(ev.id, brunch.id, { people: 110 });
    s().updateSession(ev.id, brunch.id, { people: 120 });
    s().updateSession(ev.id, brunch.id, { pricing: { mode: 'perLeaf', rate: 260 } });
    expect(s().history.filter((h) => h.eventId === ev.id)).toHaveLength(2);
    expect(sessionTotal(findSession(s().events[0], brunch.id)!.session)).toBe(31200);
  });

  it('transact with no change records nothing', () => {
    const ev = s().events[0];
    expect(s().transact(ev.id, { summary: 'noop' }, () => {})).toBeNull();
    expect(s().history).toHaveLength(0);
  });

  it('duplicates with fresh ids', () => {
    const ev = s().events[0];
    const id = s().duplicateEvent(ev.id, 'Copy')!;
    const copy = s().events.find((e) => e.id === id)!;
    expect(copy.name).toBe('Copy');
    expect(copy.days[0].sessions[0].id).not.toBe(ev.days[0].sessions[0].id);
  });

  it('persists to localStorage', () => {
    const ev = s().events[0];
    s().updateEventDetails(ev.id, { name: 'Renamed' });
    const raw = JSON.parse(localStorage.getItem('catering-quote-app')!);
    expect(raw.state.events[0].name).toBe('Renamed');
    expect(raw.state.assistant).toBeDefined();
  });
});
