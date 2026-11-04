import type { ChatMessage } from '@/types';
import type { Choice, Op } from './ops';
import type { PreviewData } from './preview';
import type { SpellingChoice, SpellingQuestion } from './spelling';
import type { ErrorKind } from './client';

export type ProposalStatus = 'pending' | 'applied' | 'declined' | 'expired' | 'undone';

export interface ProposalCard {
  kind: 'proposal';
  convId: string;
  toolUseId: string;
  status: ProposalStatus;
  summary: string;
  ops: Op[];
  /** "Did you mean …?" questions found when the card was made */
  spelling: SpellingQuestion[];
  /** spelling choices by question key (missing = suggestion) */
  choices: Record<string, SpellingChoice>;
  /** frozen preview once the card is no longer pending */
  preview?: PreviewData;
  historyId?: string;
  dayId?: string | null;
  isNewMeal: boolean;
}

export interface ChoiceCard {
  kind: 'choice';
  convId: string;
  toolUseId: string;
  status: 'pending' | 'answered' | 'expired';
  question: Choice['question'];
  options: Choice['options'];
  picked?: string;
}

export interface ErrorCard {
  kind: 'error';
  errorKind: ErrorKind;
  /** the user's message to send again with "Try again" */
  retryText?: string;
  settings?: boolean;
  resolved?: boolean;
}

export interface NoticeCard {
  kind: 'notice';
}

export type ChatCard = ProposalCard | ChoiceCard | ErrorCard | NoticeCard;

/**
 * Chat message as persisted in `chats[eventId]`. The foundation's ChatMessage has no slot for
 * cards, so the extra `card` field rides along (the store spreads unknown fields as-is).
 */
export interface AssistantMessage extends ChatMessage {
  card?: ChatCard;
}
