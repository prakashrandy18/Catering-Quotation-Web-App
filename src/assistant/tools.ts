import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { ChoiceSchema, ProposalSchema } from './ops';

function jsonSchema(schema: z.ZodType): Anthropic.Beta.BetaTool.InputSchema {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _ignored;
  return rest as Anthropic.Beta.BetaTool.InputSchema;
}

/**
 * Two client tools. Neither changes data: propose_changes only shows a preview card,
 * ask_choice only shows buttons. The app applies changes after the user's tap.
 * (Not `strict`: the operation union is large; every input is validated with zod instead
 * and problems come back as is_error tool_results.)
 * The list is built once and never changes during a conversation (keeps the cache and
 * thinking blocks valid).
 */
export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'propose_changes',
    description:
      'Propose edits to the current event. Shows the user a preview card (Removed / Added / numbers before → after / total) with Yes / No buttons. Nothing changes until the user taps Yes; the result tells you what they decided. Put every operation for one request in a single call. Reference meals by MEAL id and days by DAY id (or date) from the latest <event> snapshot.',
    input_schema: jsonSchema(ProposalSchema),
  },
  {
    name: 'ask_choice',
    description:
      'Ask the user to pick one option with tappable buttons when a request is ambiguous (e.g. "lunch" matches two meals). Their pick arrives as their next message. Use 2–6 short options.',
    input_schema: jsonSchema(ChoiceSchema),
  },
];
