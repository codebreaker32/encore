import { useMemo } from 'react';
import type {
  ActId,
  JudgeRequest,
  JudgeVerdict,
  McLine,
  McLineRequest,
  McNote,
  McReply,
  McUnavailableReason,
  PersonaId,
  Reaction,
  Scorecard,
  SetRecord,
  VenueId,
} from '@strumble/crowd';
import { config } from './config';

/**
 * The MC client. Every MC word comes from the model behind services/mc-agent; there is no substitute text anywhere.
 * When the model cannot answer, the result is `unavailable` with a reason, and the screen says so in plain words.
 */

/** The debrief request: the set summary with its measured numbers and the MC's memory. Mirrors services/mc-agent models. */
export interface DebriefRequest {
  kind: 'debrief';
  persona: PersonaId;
  performer: string;
  act: ActId;
  venue: VenueId;
  scorecard: Scorecard;
  lines: { t: number; landed: boolean; text?: string }[];
  reactions: Reaction[];
  history: SetRecord[];
  /** Ask for the MC's voice (Amazon Polly) as well. */
  speak?: boolean;
}

export interface ChatRequest {
  kind: 'chat';
  persona: PersonaId;
  performer: string;
  question: string;
  history: SetRecord[];
  lastScorecard: Scorecard | null;
  speak?: boolean;
}

export interface McSilent {
  status: 'unavailable';
  reason: McUnavailableReason;
  detail?: string;
}

export type DebriefStatus = { status: 'writing' } | { status: 'ready'; note: McNote } | McSilent;
export type ChatStatus = { status: 'writing' } | { status: 'ready'; reply: McReply } | McSilent;
export type LineResult = { status: 'ready'; line: McLine } | McSilent;

const REASONS: McUnavailableReason[] = ['timeout', 'model-error', 'rejected', 'no-credentials', 'unreachable'];

/** The reason in plain words, for "The MC couldn't be reached (…)". */
export function reasonInWords(reason: McUnavailableReason): string {
  switch (reason) {
    case 'timeout':
      return 'timed out';
    case 'no-credentials':
      return 'no AWS sign-in on this machine';
    case 'rejected':
      return 'its answer failed the honesty check';
    case 'model-error':
      return 'the model returned an error';
    default:
      return 'no connection to the MC service';
  }
}

function silent(reason: McUnavailableReason, detail?: string): McSilent {
  return { status: 'unavailable', reason, detail };
}

class ClientTimeout extends Error {}

/** POST /invocations; resolves to the parsed body, or to `unavailable` when the service cannot be reached in time. */
async function invoke(
  body: DebriefRequest | ChatRequest | McLineRequest | JudgeRequest,
  budgetMs: number,
  graceMs: number = config.mcGraceMs,
): Promise<unknown> {
  const deadline = budgetMs + graceMs;
  const Abort = (globalThis as unknown as { AbortController?: new () => { signal: unknown; abort(): void } })
    .AbortController;
  const abort = Abort ? new Abort() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (abort) abort.abort();
      reject(new ClientTimeout(`no answer in ${deadline} ms`));
    }, deadline);
  });
  try {
    const init: { method: string; headers: Record<string, string>; body: string; signal?: unknown } = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    };
    if (abort) init.signal = abort.signal;
    const res = (await Promise.race([fetch(`${config.mcUrl}/invocations`, init as RequestInit), timeout])) as Response;
    if (!res.ok) return silent('model-error', `HTTP ${res.status}`);
    return await Promise.race([res.json(), timeout]);
  } catch (err) {
    // Client-side deadline or no connection: either way the service did not answer.
    return silent('unreachable', err instanceof Error ? err.message : String(err));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function asSilent(body: unknown): McSilent | null {
  const b = body as { status?: string; unavailable?: { reason?: string; detail?: string }; error?: string } | null;
  if (!b || typeof b !== 'object') return silent('model-error', 'empty answer');
  if (b.status === 'unavailable') return b as McSilent;
  if (b.unavailable) {
    const reason =
      REASONS.indexOf(b.unavailable.reason as McUnavailableReason) >= 0
        ? (b.unavailable.reason as McUnavailableReason)
        : 'model-error';
    return silent(reason, b.unavailable.detail);
  }
  if (b.error) return silent('model-error', b.error);
  return null;
}

/** Only the model's own words are accepted: anything not marked `source: 'ai'` is treated as no answer. */
function isModel(x: { source?: unknown } | undefined): boolean {
  return !!x && x.source === 'ai';
}

export async function requestDebrief(req: DebriefRequest): Promise<Exclude<DebriefStatus, { status: 'writing' }>> {
  const body = await invoke(req, config.mcTimeoutMs);
  const none = asSilent(body);
  if (none) return none;
  const note = (body as { note?: McNote }).note;
  if (note && isModel(note) && typeof note.line === 'string' && typeof note.fix === 'string')
    return { status: 'ready', note };
  return silent('model-error', 'the answer was not a model-written note');
}

export async function requestChat(req: ChatRequest): Promise<Exclude<ChatStatus, { status: 'writing' }>> {
  const body = await invoke(req, config.mcTimeoutMs);
  const none = asSilent(body);
  if (none) return none;
  const reply = (body as { reply?: McReply }).reply;
  if (reply && isModel(reply) && typeof reply.text === 'string' && reply.text.trim()) return { status: 'ready', reply };
  return silent('model-error', 'the answer was not a model-written reply');
}

/** The words for one title card. A line that misses its moment simply never shows. */
export async function requestLine(req: McLineRequest): Promise<LineResult> {
  const body = await invoke(req, config.mcLineTimeoutMs);
  const none = asSilent(body);
  if (none) return none;
  const line = (body as { line?: McLine }).line;
  if (line && isModel(line) && typeof line.text === 'string' && line.text.trim()) return { status: 'ready', line };
  return silent('model-error', 'the answer was not a model-written line');
}

/**
 * The content judge's budget on the service (MC_JUDGE_TIMEOUT_S, 0.35 s) and the little the TV waits beyond it. The
 * engine stops waiting for a verdict JUDGE_DEADLINE_SEC after the line whatever happens here, so a slow answer only
 * ever arrives too late to count.
 */
const JUDGE_BUDGET_MS = 350;
const JUDGE_GRACE_MS = 250;

export type JudgeResult = { status: 'ready'; verdict: JudgeVerdict } | McSilent;

/**
 * One line's content estimate (an opinion of the words, labelled as one on screen). Sent with the same `fetch` as the
 * other kinds, so it rides the platform's pooled keep-alive connection to the service (OkHttp on Android, the
 * browser's pool on web, Vega's fetch on RN 0.72): no new connection per line once the first is open.
 */
export async function requestJudge(req: JudgeRequest): Promise<JudgeResult> {
  const body = await invoke(req, JUDGE_BUDGET_MS, JUDGE_GRACE_MS);
  const none = asSilent(body);
  if (none) return none;
  const verdict = (body as { verdict?: JudgeVerdict }).verdict;
  if (verdict && isModel(verdict) && verdict.lineId === req.lineId && typeof verdict.score === 'number') {
    return { status: 'ready', verdict };
  }
  return silent('model-error', 'the answer was not a model-written verdict');
}

export function useMc() {
  return useMemo(() => ({ debrief: requestDebrief, chat: requestChat, line: requestLine, judge: requestJudge }), []);
}
