import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import EventLayout from '@/components/EventLayout';
import { Toaster } from '@/components/ui/Toaster';
import { useAppStore } from '@/store/useAppStore';
import { applyBrandColor } from '@/lib/theme';
import { requestPersistentStorage } from '@/lib/backup';

import EventsScreen from '@/screens/EventsScreen';
import NewEventScreen from '@/screens/NewEventScreen';
import MenuScreen from '@/screens/MenuScreen';
import SessionScreen from '@/screens/SessionScreen';
import AddDishScreen from '@/screens/AddDishScreen';
import HistoryScreen from '@/screens/HistoryScreen';
import EventDetailsScreen from '@/screens/EventDetailsScreen';

// The PDF screen pulls in @react-pdf/renderer + pdf.js → load it only when needed.
const PreviewScreen = lazy(() => import('@/pdf/PreviewScreen'));
// The chat screen pulls in the Anthropic SDK → also lazy.
const ChatScreen = lazy(() => import('@/assistant/ChatScreen'));
// Settings embeds the Claude settings card (SDK) → lazy as well.
const SettingsScreen = lazy(() => import('@/screens/SettingsScreen'));

/**
 * Route map (HashRouter so it works on GitHub Pages):
 *   #/                                   Events home (F01)
 *   #/new                                New event (F02)
 *   #/settings                           Logo & colours + Claude + backup (F11)
 *   #/event/:eventId/chat                Chat with Claude (F03/F04)
 *   #/event/:eventId/menu                Menu by day (F07)
 *   #/event/:eventId/menu/:sessionId     Edit a meal (F08)
 *   #/event/:eventId/menu/:sessionId/add Add dish (F09)
 *   #/event/:eventId/pdf                 PDF preview + share (F05/F06)
 *   #/event/:eventId/history             Recent changes + undo (F10)
 *   #/event/:eventId/details             Event name / client / dates / location
 */
export default function App() {
  const brandColor = useAppStore((s) => s.brand.brandColor);

  useEffect(() => {
    applyBrandColor(brandColor);
  }, [brandColor]);

  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<EventsScreen />} />
        <Route path="/new" element={<NewEventScreen />} />
        <Route
          path="/settings"
          element={
            <Suspense fallback={<div className="p-6 text-ink-muted">Loading settings…</div>}>
              <SettingsScreen />
            </Suspense>
          }
        />
        <Route path="/event/:eventId" element={<EventLayout />}>
          <Route index element={<Navigate to="menu" replace />} />
          <Route
            path="chat"
            element={
              <Suspense fallback={<div className="p-6 text-ink-muted">Loading chat…</div>}>
                <ChatScreen />
              </Suspense>
            }
          />
          <Route path="menu" element={<MenuScreen />} />
          <Route path="menu/:sessionId" element={<SessionScreen />} />
          <Route path="menu/:sessionId/add" element={<AddDishScreen />} />
          <Route
            path="pdf"
            element={
              <Suspense fallback={<div className="p-6 text-ink-muted">Loading PDF…</div>}>
                <PreviewScreen />
              </Suspense>
            }
          />
          <Route path="history" element={<HistoryScreen />} />
          <Route path="details" element={<EventDetailsScreen />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </HashRouter>
  );
}
