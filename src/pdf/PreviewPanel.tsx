// STUB — owned by the pdf agent. Live preview pane shown beside the editor on ≥768px.
import type { CateringEvent } from '@/types';
export default function PreviewPanel({ event }: { event: CateringEvent }) {
  return <div className="p-6 text-ink-muted">Preview of {event.name} (coming soon)</div>;
}
