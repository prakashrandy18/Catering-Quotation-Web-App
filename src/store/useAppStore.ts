import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { produce, type Draft } from 'immer';
import type {
  Actor,
  AssistantSettings,
  BrandSettings,
  CateringEvent,
  ChatMessage,
  Day,
  Dish,
  EntryKind,
  EventStatus,
  HistoryEntry,
  ID,
  MenuEntry,
  Session,
} from '@/types';
import { newId } from '@/lib/id';
import { buildSampleEvent, DEFAULT_ASSISTANT, DEFAULT_BRAND } from '@/data/seed';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ChangeInfo {
  by?: Actor; // default 'you'
  summary: string;
  detail?: string;
  /** Rapid edits with the same key (same actor, < 5s apart) merge into one history entry. */
  coalesceKey?: string;
}

export interface AppMeta {
  lastBackupAt: number | null;
  shareCount: number;
  installDismissed: boolean;
  lastEventId: ID | null;
  /** Remembered spelling choices: typed (lowercase) → chosen name. */
  spellingMemory: Record<string, string>;
}

export interface AppData {
  events: CateringEvent[];
  history: HistoryEntry[]; // newest first
  chats: Record<ID, ChatMessage[]>;
  brand: BrandSettings;
  assistant: AssistantSettings;
  customDishes: Dish[];
  meta: AppMeta;
}

export interface AppActions {
  /* events */
  createEvent: (event: CateringEvent) => ID;
  duplicateEvent: (eventId: ID, name?: string) => ID | null;
  deleteEvent: (eventId: ID) => void;
  updateEventDetails: (
    eventId: ID,
    patch: Partial<Pick<CateringEvent, 'name' | 'clientName' | 'clientPhone' | 'location' | 'notes'>>,
    info?: Partial<ChangeInfo>,
  ) => void;
  setStatus: (eventId: ID, status: EventStatus) => void;

  /** Core primitive: apply any change to one event as ONE undoable history entry. Returns history id or null if nothing changed. */
  transact: (eventId: ID, info: ChangeInfo, recipe: (draft: Draft<CateringEvent>) => void) => ID | null;

  /* days */
  addDay: (eventId: ID, day: { date: string; title: string }, info?: Partial<ChangeInfo>) => ID;
  updateDay: (eventId: ID, dayId: ID, patch: Partial<Pick<Day, 'date' | 'title'>>, info?: Partial<ChangeInfo>) => void;
  removeDay: (eventId: ID, dayId: ID, info?: Partial<ChangeInfo>) => void;

  /* sessions ("meals") */
  addSession: (
    eventId: ID,
    dayId: ID,
    session: Partial<Omit<Session, 'id'>> & { name: string },
    index?: number,
    info?: Partial<ChangeInfo>,
  ) => ID;
  updateSession: (
    eventId: ID,
    sessionId: ID,
    patch: Partial<Omit<Session, 'id' | 'entries'>>,
    info?: Partial<ChangeInfo>,
  ) => void;
  removeSession: (eventId: ID, sessionId: ID, info?: Partial<ChangeInfo>) => void;
  moveSession: (eventId: ID, sessionId: ID, dir: -1 | 1) => void;
  moveSessionToDay: (eventId: ID, sessionId: ID, dayId: ID, index?: number) => void;

  /* entries (dishes / blank space / sub-heading) */
  addEntry: (
    eventId: ID,
    sessionId: ID,
    entry: { kind?: EntryKind; text: string },
    index?: number,
    info?: Partial<ChangeInfo>,
  ) => ID;
  updateEntry: (eventId: ID, sessionId: ID, entryId: ID, text: string, info?: Partial<ChangeInfo>) => void;
  removeEntry: (eventId: ID, sessionId: ID, entryId: ID, info?: Partial<ChangeInfo>) => void;
  moveEntry: (eventId: ID, sessionId: ID, entryId: ID, dir: -1 | 1) => void;

  /* history */
  /** Restore the event to how it was before the given change. Records an "Undid …" entry (undo that to redo). */
  undo: (historyId: ID) => ID | null;

  /* chat */
  addChatMessage: (eventId: ID, msg: Omit<ChatMessage, 'id' | 'at'> & { id?: ID; at?: number }) => ID;
  updateChatMessage: (eventId: ID, msgId: ID, patch: Partial<ChatMessage>) => void;
  clearChat: (eventId: ID) => void;

  /* settings */
  updateBrand: (patch: Partial<BrandSettings>) => void;
  updateAssistant: (patch: Partial<AssistantSettings>) => void;
  addCustomDish: (dish: Dish) => void;
  rememberSpelling: (typed: string, chosen: string) => void;

  /* meta */
  setLastEvent: (eventId: ID | null) => void;
  markBackupDone: () => void;
  incrementShareCount: () => void;
  dismissInstall: () => void;

  /* backup */
  replaceAll: (data: Partial<AppData>) => void;
  resetToSample: () => void;
}

export type AppState = AppData & AppActions;

/* ------------------------------------------------------------------ */
/* Helpers (also exported for the assistant / screens)                 */
/* ------------------------------------------------------------------ */

const MAX_HISTORY_PER_EVENT = 40;
const COALESCE_MS = 5000;

export function findSession(
  event: CateringEvent | Draft<CateringEvent>,
  sessionId: ID,
): { day: Day; dayIndex: number; session: Session; sessionIndex: number } | null {
  for (let di = 0; di < event.days.length; di++) {
    const day = event.days[di] as Day;
    const si = day.sessions.findIndex((s) => s.id === sessionId);
    if (si >= 0) return { day, dayIndex: di, session: day.sessions[si], sessionIndex: si };
  }
  return null;
}

export function findEvent(state: Pick<AppData, 'events'>, eventId: ID | undefined | null): CateringEvent | undefined {
  return eventId ? state.events.find((e) => e.id === eventId) : undefined;
}

function trimHistory(history: HistoryEntry[], eventId: ID): HistoryEntry[] {
  let count = 0;
  return history.filter((h) => {
    if (h.eventId !== eventId) return true;
    count++;
    return count <= MAX_HISTORY_PER_EVENT;
  });
}

function initialData(): AppData {
  const sample = buildSampleEvent();
  return {
    events: [sample],
    history: [],
    chats: {},
    brand: { ...DEFAULT_BRAND },
    assistant: { ...DEFAULT_ASSISTANT },
    customDishes: [],
    meta: { lastBackupAt: null, shareCount: 0, installDismissed: false, lastEventId: null, spellingMemory: {} },
  };
}

const withInfo = (info: Partial<ChangeInfo> | undefined, fallback: ChangeInfo): ChangeInfo => ({ ...fallback, ...info });

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const STORAGE_KEY = 'catering-quote-app';
export const STORAGE_VERSION = 1;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const transact: AppActions['transact'] = (eventId, info, recipe) => {
        const state = get();
        const before = state.events.find((e) => e.id === eventId);
        if (!before) return null;
        const changed = produce(before, recipe);
        if (changed === before) return null;
        const now = Date.now();
        const after: CateringEvent = { ...changed, updatedAt: now };
        const by = info.by ?? 'you';

        const latest = state.history.find((h) => h.eventId === eventId);
        const canCoalesce =
          !!info.coalesceKey &&
          !!latest &&
          latest.coalesceKey === info.coalesceKey &&
          latest.by === by &&
          now - latest.at < COALESCE_MS;

        let history: HistoryEntry[];
        let historyId: ID;
        if (canCoalesce && latest) {
          historyId = latest.id;
          history = state.history.map((h) =>
            h.id === latest.id ? { ...h, at: now, summary: info.summary, detail: info.detail ?? h.detail } : h,
          );
        } else {
          historyId = newId('hi');
          const entry: HistoryEntry = {
            id: historyId,
            eventId,
            at: now,
            by,
            summary: info.summary,
            detail: info.detail,
            before,
            coalesceKey: info.coalesceKey,
          };
          history = trimHistory([entry, ...state.history], eventId);
        }
        set({ events: state.events.map((e) => (e.id === eventId ? after : e)), history });
        return historyId;
      };

      const sessionName = (eventId: ID, sessionId: ID) => {
        const e = get().events.find((x) => x.id === eventId);
        return (e && findSession(e, sessionId)?.session.name) || 'Meal';
      };

      return {
        ...initialData(),

        transact,

        createEvent: (event) => {
          const entry: HistoryEntry = {
            id: newId('hi'),
            eventId: event.id,
            at: Date.now(),
            by: 'you',
            summary: 'Event created',
            before: null,
          };
          set((s) => ({ events: [event, ...s.events], history: [entry, ...s.history], meta: { ...s.meta, lastEventId: event.id } }));
          return event.id;
        },

        duplicateEvent: (eventId, name) => {
          const src = get().events.find((e) => e.id === eventId);
          if (!src) return null;
          const now = Date.now();
          const copy: CateringEvent = {
            ...structuredClone(src),
            id: newId('ev'),
            name: name?.trim() || `${src.name} (copy)`,
            status: 'draft',
            createdAt: now,
            updatedAt: now,
          };
          copy.days.forEach((d) => {
            d.id = newId('dy');
            d.sessions.forEach((s) => {
              s.id = newId('se');
              s.entries.forEach((en) => (en.id = newId('en')));
            });
          });
          return get().createEvent(copy);
        },

        deleteEvent: (eventId) =>
          set((s) => {
            const chats = { ...s.chats };
            delete chats[eventId];
            return {
              events: s.events.filter((e) => e.id !== eventId),
              history: s.history.filter((h) => h.eventId !== eventId),
              chats,
              meta: { ...s.meta, lastEventId: s.meta.lastEventId === eventId ? null : s.meta.lastEventId },
            };
          }),

        updateEventDetails: (eventId, patch, info) => {
          const keys = Object.keys(patch).sort().join(',');
          transact(eventId, withInfo(info, { summary: 'Event details changed', coalesceKey: `details:${keys}` }), (d) => {
            Object.assign(d, patch);
          });
        },

        setStatus: (eventId, status) => {
          const label = status === 'draft' ? 'Not sent' : status === 'sent' ? 'Sent' : 'Confirmed';
          transact(eventId, { summary: `Marked as ${label}` }, (d) => {
            d.status = status;
          });
        },

        addDay: (eventId, day, info) => {
          const id = newId('dy');
          transact(eventId, withInfo(info, { summary: `Added day ${day.date}` }), (d) => {
            d.days.push({ id, date: day.date, title: day.title, sessions: [] });
          });
          return id;
        },

        updateDay: (eventId, dayId, patch, info) => {
          transact(eventId, withInfo(info, { summary: 'Day changed', coalesceKey: `day:${dayId}:${Object.keys(patch).join(',')}` }), (d) => {
            const day = d.days.find((x) => x.id === dayId);
            if (day) Object.assign(day, patch);
          });
        },

        removeDay: (eventId, dayId, info) => {
          const e = get().events.find((x) => x.id === eventId);
          const day = e?.days.find((x) => x.id === dayId);
          transact(eventId, withInfo(info, { summary: `Removed day ${day?.date ?? ''}`.trim() }), (d) => {
            d.days = d.days.filter((x) => x.id !== dayId);
          });
        },

        addSession: (eventId, dayId, session, index, info) => {
          const id = newId('se');
          const full: Session = {
            id,
            name: session.name,
            icon: session.icon ?? '🍽️',
            time: session.time ?? null,
            people: session.people === undefined ? 100 : session.people,
            pricing: session.pricing ?? { mode: 'perLeaf', rate: null },
            entries: (session.entries ?? []).map((en) => ({ ...en, id: en.id || newId('en') })),
          };
          transact(eventId, withInfo(info, { summary: `Added meal ${session.name}` }), (d) => {
            const day = d.days.find((x) => x.id === dayId);
            if (!day) return;
            if (index == null || index < 0 || index > day.sessions.length) day.sessions.push(full);
            else day.sessions.splice(index, 0, full);
          });
          return id;
        },

        updateSession: (eventId, sessionId, patch, info) => {
          const name = sessionName(eventId, sessionId);
          transact(
            eventId,
            withInfo(info, { summary: `${name} changed`, coalesceKey: `session:${sessionId}:${Object.keys(patch).sort().join(',')}` }),
            (d) => {
              const found = findSession(d, sessionId);
              if (found) Object.assign(found.session, patch);
            },
          );
        },

        removeSession: (eventId, sessionId, info) => {
          const name = sessionName(eventId, sessionId);
          transact(eventId, withInfo(info, { summary: `Removed meal ${name}` }), (d) => {
            d.days.forEach((day) => {
              day.sessions = day.sessions.filter((s) => s.id !== sessionId);
            });
          });
        },

        moveSession: (eventId, sessionId, dir) => {
          const name = sessionName(eventId, sessionId);
          transact(eventId, { summary: `Moved ${name}` }, (d) => {
            const found = findSession(d, sessionId);
            if (!found) return;
            const list = d.days[found.dayIndex].sessions;
            const to = found.sessionIndex + dir;
            if (to < 0 || to >= list.length) return;
            const [item] = list.splice(found.sessionIndex, 1);
            list.splice(to, 0, item);
          });
        },

        moveSessionToDay: (eventId, sessionId, dayId, index) => {
          const name = sessionName(eventId, sessionId);
          transact(eventId, { summary: `Moved ${name} to another day` }, (d) => {
            const found = findSession(d, sessionId);
            const target = d.days.find((x) => x.id === dayId);
            if (!found || !target) return;
            const [item] = d.days[found.dayIndex].sessions.splice(found.sessionIndex, 1);
            if (index == null || index < 0 || index > target.sessions.length) target.sessions.push(item);
            else target.sessions.splice(index, 0, item);
          });
        },

        addEntry: (eventId, sessionId, entry, index, info) => {
          const id = newId('en');
          const kind = entry.kind ?? 'dish';
          const name = sessionName(eventId, sessionId);
          const detail = kind === 'dish' ? `Added: ${entry.text}` : kind === 'gap' ? 'Added a blank space' : `Added heading: ${entry.text}`;
          transact(eventId, withInfo(info, { summary: `${name} updated`, detail }), (d) => {
            const found = findSession(d, sessionId);
            if (!found) return;
            const item: MenuEntry = { id, kind, text: kind === 'gap' ? '' : entry.text };
            const list = found.session.entries;
            if (index == null || index < 0 || index > list.length) list.push(item);
            else list.splice(index, 0, item);
          });
          return id;
        },

        updateEntry: (eventId, sessionId, entryId, text, info) => {
          const name = sessionName(eventId, sessionId);
          transact(eventId, withInfo(info, { summary: `${name} updated`, detail: `Renamed dish to ${text}`, coalesceKey: `entry:${entryId}` }), (d) => {
            const found = findSession(d, sessionId);
            const en = found?.session.entries.find((x) => x.id === entryId);
            if (en) en.text = text;
          });
        },

        removeEntry: (eventId, sessionId, entryId, info) => {
          const e = get().events.find((x) => x.id === eventId);
          const f = e && findSession(e, sessionId);
          const en = f?.session.entries.find((x) => x.id === entryId);
          const detail = en ? (en.kind === 'dish' ? `Removed: ${en.text}` : en.kind === 'gap' ? 'Removed a blank space' : `Removed heading: ${en.text}`) : undefined;
          transact(eventId, withInfo(info, { summary: `${f?.session.name ?? 'Meal'} updated`, detail }), (d) => {
            const found = findSession(d, sessionId);
            if (found) found.session.entries = found.session.entries.filter((x) => x.id !== entryId);
          });
        },

        moveEntry: (eventId, sessionId, entryId, dir) => {
          const name = sessionName(eventId, sessionId);
          transact(eventId, { summary: `${name} reordered`, coalesceKey: `move:${entryId}` }, (d) => {
            const found = findSession(d, sessionId);
            if (!found) return;
            const list = found.session.entries;
            const i = list.findIndex((x) => x.id === entryId);
            const to = i + dir;
            if (i < 0 || to < 0 || to >= list.length) return;
            const [item] = list.splice(i, 1);
            list.splice(to, 0, item);
          });
        },

        undo: (historyId) => {
          const state = get();
          const h = state.history.find((x) => x.id === historyId);
          if (!h || !h.before) return null;
          const current = state.events.find((e) => e.id === h.eventId);
          if (!current) return null;
          const restored: CateringEvent = { ...h.before, updatedAt: Date.now() };
          const entry: HistoryEntry = {
            id: newId('hi'),
            eventId: h.eventId,
            at: Date.now(),
            by: 'you',
            summary: `Undid: ${h.summary}`,
            detail: h.detail,
            before: current,
          };
          set({
            events: state.events.map((e) => (e.id === h.eventId ? restored : e)),
            history: trimHistory([entry, ...state.history], h.eventId),
          });
          return entry.id;
        },

        addChatMessage: (eventId, msg) => {
          const id = msg.id ?? newId('ms');
          const full: ChatMessage = { ...msg, id, at: msg.at ?? Date.now() } as ChatMessage;
          set((s) => ({ chats: { ...s.chats, [eventId]: [...(s.chats[eventId] ?? []), full].slice(-80) } }));
          return id;
        },

        updateChatMessage: (eventId, msgId, patch) =>
          set((s) => ({
            chats: { ...s.chats, [eventId]: (s.chats[eventId] ?? []).map((m) => (m.id === msgId ? { ...m, ...patch } : m)) },
          })),

        clearChat: (eventId) => set((s) => ({ chats: { ...s.chats, [eventId]: [] } })),

        updateBrand: (patch) => set((s) => ({ brand: { ...s.brand, ...patch } })),
        updateAssistant: (patch) => set((s) => ({ assistant: { ...s.assistant, ...patch } })),
        addCustomDish: (dish) =>
          set((s) =>
            s.customDishes.some((d) => d.name.toLowerCase() === dish.name.toLowerCase())
              ? s
              : { customDishes: [...s.customDishes, dish] },
          ),
        rememberSpelling: (typed, chosen) =>
          set((s) => ({ meta: { ...s.meta, spellingMemory: { ...s.meta.spellingMemory, [typed.trim().toLowerCase()]: chosen } } })),

        setLastEvent: (eventId) => set((s) => ({ meta: { ...s.meta, lastEventId: eventId } })),
        markBackupDone: () => set((s) => ({ meta: { ...s.meta, lastBackupAt: Date.now() } })),
        incrementShareCount: () => set((s) => ({ meta: { ...s.meta, shareCount: s.meta.shareCount + 1 } })),
        dismissInstall: () => set((s) => ({ meta: { ...s.meta, installDismissed: true } })),

        replaceAll: (data) => set((s) => ({ ...s, ...data })),
        resetToSample: () => set(() => initialData()),
      };
    },
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): AppData => ({
        events: s.events,
        history: s.history,
        chats: s.chats,
        brand: s.brand,
        assistant: s.assistant,
        customDishes: s.customDishes,
        meta: s.meta,
      }),
      migrate: (persisted, version) => {
        // v1 is the first version. Future migrations go here (persisted is the old AppData).
        void version;
        return persisted as AppData;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppData>;
        return {
          ...current,
          ...p,
          brand: { ...current.brand, ...(p.brand ?? {}) },
          assistant: { ...current.assistant, ...(p.assistant ?? {}) },
          meta: { ...current.meta, ...(p.meta ?? {}) },
        };
      },
    },
  ),
);

/* Convenience selector hooks */
export const useEvent = (eventId: ID | undefined) => useAppStore((s) => (eventId ? s.events.find((e) => e.id === eventId) : undefined));
