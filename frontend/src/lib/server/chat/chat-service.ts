import "server-only";
import { randomUUID } from "node:crypto";
import { AiError } from "../ai/contracts.ts";
import type { ConversationSession, ConversationTurn } from "../ai/conversation-contracts.ts";
import type { ConversationResult } from "../ai/application/conversation-session.ts";
import { createConditionSaveService } from "../ai/application/condition-save.ts";
import type { ConditionSaveOutcome, ConditionSavePort } from "../ai/application/condition-save.ts";
import type { ChatTurnEvent } from "../../chat-stream.ts";

type Runtime = {
  createSession(userId: string): ConversationSession;
  runTurn(session: ConversationSession, turn: ConversationTurn, options: {
    commit: (result: ConversationResult) => Promise<void>; signal?: AbortSignal; onEvent?: (event: ChatTurnEvent) => void;
  }): Promise<ConversationResult>;
  closeSession(session: ConversationSession, signal?: AbortSignal): Promise<void>;
};
type Timer = unknown;
type Timers = { setTimeout(callback: () => void, delay: number): Timer; clearTimeout(timer: Timer): void };
type PortFactory = (context: { conversationId: string; ownerId: string; getCookie: () => string }) => ConditionSavePort;
type Authenticate = (cookie: string, signal: AbortSignal) => Promise<{ userId: string }>;
type SaveStatus = ConditionSaveOutcome["status"];
type Entry = {
  owner: string;
  session: ConversationSession;
  save: ReturnType<typeof createConditionSaveService>;
  cookie: string;
  generation: number;
  generating: boolean;
  turnDone?: Promise<void>;
  finishTurn?: () => void;
  timer?: Timer;
  closing?: Promise<{ closed: true; saveStatus: SaveStatus }>;
};
type Tombstone = { owner: string; saveStatus: SaveStatus; expiresAt: number };

export class ChatFailure extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
const messages: Record<string, string> = {
  CONVERSATION_BUSY: "이 상담의 답변을 만들고 있어요.",
  CONVERSATION_CLOSED: "상담이 끝났어요. 새 상담을 시작해 주세요.",
  MODEL_NOT_CONFIGURED: "AI 연결 설정을 확인해 주세요.",
  MODEL_UNAVAILABLE: "답변을 만들지 못했어요. 새 상담에서 다시 질문해 주세요.",
  AI_CANCELLED: "요청이 취소되었어요. 새 상담을 시작해 주세요.",
};

export function createChatService(runtime: Runtime, options: {
  authenticate?: Authenticate;
  conditionSavePort?: PortFactory;
  idleMs?: number;
  clock?: () => number;
  timers?: Timers;
} = {}) {
  const entries = new Map<string, Entry>();
  const tombstones = new Map<string, Tombstone>();
  const idleMs = options.idleMs ?? 90_000;
  if (!Number.isSafeInteger(idleMs) || idleMs <= 0 || idleMs > 2_147_483_647) throw new Error("INVALID_CHAT_IDLE_MS");
  const now = options.clock ?? Date.now;
  const timers = options.timers ?? {
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
    clearTimeout: (timer: Timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  };
  const fail = (status: number, code: string, fallback?: string): never => {
    throw new ChatFailure(status, code, messages[code] ?? fallback ?? "요청을 완료하지 못했습니다.");
  };
  const clearTimer = (entry: Entry) => {
    if (entry.timer !== undefined) timers.clearTimeout(entry.timer);
    entry.timer = undefined;
  };
  const setUnrefTimer = (callback: () => void, delay: number) => {
    const timer = timers.setTimeout(callback, delay);
    if (typeof timer === "object" && timer && "unref" in timer) (timer as NodeJS.Timeout).unref();
    return timer;
  };
  const remember = (conversationId: string, owner: string, saveStatus: SaveStatus) => {
    const expiresAt = now() + 30_000;
    tombstones.set(conversationId, { owner, saveStatus, expiresAt });
    setUnrefTimer(() => {
      const current = tombstones.get(conversationId);
      if (current?.expiresAt === expiresAt) tombstones.delete(conversationId);
    }, 30_000);
  };
  const findTombstone = (conversationId: string, owner: string) => {
    const value = tombstones.get(conversationId);
    if (!value || value.expiresAt <= now()) { tombstones.delete(conversationId); return undefined; }
    if (value.owner !== owner) fail(404, "CONVERSATION_NOT_FOUND", "상담을 찾을 수 없습니다.");
    return value;
  };

  const expire = async (conversationId: string, generation: number) => {
    const entry = entries.get(conversationId);
    if (!entry || entry.generation !== generation || entry.generating || entry.closing) return;
    const cookie = entry.cookie;
    let authenticated = !options.authenticate;
    if (options.authenticate) {
      try {
        const member = await options.authenticate(cookie, AbortSignal.timeout(10_000));
        authenticated = member.userId === entry.owner;
      } catch { authenticated = false; }
    }
    const current = entries.get(conversationId);
    if (current !== entry || entry.generation !== generation || entry.generating || entry.closing) return;
    await closeEntry(conversationId, entry, authenticated);
  };
  const armIdle = (conversationId: string, entry: Entry) => {
    clearTimer(entry);
    const generation = ++entry.generation;
    entry.timer = setUnrefTimer(() => { void expire(conversationId, generation); }, idleMs);
  };

  function closeEntry(conversationId: string, entry: Entry, shouldSave: boolean): Promise<{ closed: true; saveStatus: SaveStatus }> {
    if (entry.closing) return entry.closing;
    clearTimer(entry);
    entry.generation++;
    entry.closing = (async () => {
      if (entry.turnDone) await entry.turnDone;
      let saveStatus: SaveStatus = "outcome_unconfirmed";
      try {
        if (shouldSave) {
          saveStatus = (await entry.save.requestSave({ authenticatedOwnerId: entry.owner, attemptId: randomUUID() })).status;
        }
      } catch { saveStatus = "outcome_unconfirmed"; }
      try { await runtime.closeSession(entry.session, AbortSignal.timeout(10_000)); }
      catch { /* The entry is discarded below even if provider cleanup fails. */ }
      finally {
        if (entries.get(conversationId) === entry) entries.delete(conversationId);
        remember(conversationId, entry.owner, saveStatus);
      }
      return { closed: true as const, saveStatus };
    })();
    return entry.closing;
  }

  return {
    async send(input: { conversationId?: string; clientRequestId: string; message: string }, context: {
      userId: string; cookie: string; requestId: string; signal: AbortSignal; onEvent?: (event: ChatTurnEvent) => void;
    }): Promise<{ conversationId: string; message: { role: "assistant"; text: string } }> {
      let conversationId = input.conversationId;
      let entry = conversationId ? entries.get(conversationId) : undefined;
      if (conversationId && !entry) {
        if (findTombstone(conversationId, context.userId)) fail(409, "CONVERSATION_CLOSED");
        fail(409, "CONVERSATION_EXPIRED", "상담이 만료되었어요. 새 상담을 시작해 주세요.");
      }
      if (!conversationId) {
        conversationId = randomUUID();
        const holder: { entry?: Entry } = {};
        const port = options.conditionSavePort?.({ conversationId, ownerId: context.userId,
          getCookie: () => holder.entry?.cookie ?? context.cookie })
          ?? { async save() { return { status: "outcome_unconfirmed" as const }; } };
        const created: Entry = { owner: context.userId, session: runtime.createSession(context.userId),
          save: createConditionSaveService({ conversationId, ownerId: context.userId, port }), cookie: context.cookie,
          generation: 0, generating: false };
        holder.entry = created;
        entry = created;
        entries.set(conversationId, entry);
      }
      const active = entry!;
      if (active.owner !== context.userId) fail(404, "CONVERSATION_NOT_FOUND", "상담을 찾을 수 없습니다.");
      if (active.closing) fail(409, "CONVERSATION_CLOSED");
      if (active.generating) fail(409, "CONVERSATION_BUSY");
      active.cookie = context.cookie;
      clearTimer(active);
      active.generation++;
      active.generating = true;
      active.turnDone = new Promise<void>(resolve => { active.finishTurn = resolve; });
      const finishTurn = () => {
        if (!active.generating && !active.turnDone) return;
        active.generating = false;
        active.finishTurn?.();
        active.finishTurn = undefined;
        active.turnDone = undefined;
      };
      const turn: ConversationTurn = { authenticatedUserId: context.userId, turnId: input.clientRequestId,
        text: input.message, sessionHeaders: { Cookie: context.cookie }, requestId: context.requestId };
      try {
        let committed = false;
        const answer = await runtime.runTurn(active.session, turn, { signal: context.signal, onEvent: context.onEvent,
          commit: async result => {
            context.signal.throwIfAborted();
            active.save.acceptSuccessfulTurn({ authenticatedOwnerId: context.userId, turnId: input.clientRequestId,
              observedAt: new Date(now()).toISOString(), memory: result.memory });
            committed = true;
          } });
        finishTurn();
        if (!committed) fail(503, "CHAT_COMMIT_FAILED");
        if (active.closing) { await active.closing; fail(409, "CONVERSATION_CLOSED"); }
        armIdle(conversationId, active);
        return { conversationId, message: { role: "assistant" as const, text: answer.text } };
      } catch (error) {
        finishTurn();
        if (error instanceof AiError && error.code === "CONVERSATION_BUSY") return fail(409, error.code);
        await closeEntry(conversationId, active, true);
        if (error instanceof ChatFailure) throw error;
        if (error instanceof AiError) return fail(503, error.code);
        return fail(503, "CHAT_UNAVAILABLE", "답변을 만들지 못했어요. 새 상담에서 다시 질문해 주세요.");
      }
    },
    async keepAlive(conversationId: string, userId: string, cookie: string): Promise<{ active: true }> {
      const entry = entries.get(conversationId);
      if (!entry) {
        findTombstone(conversationId, userId);
        return fail(409, "CONVERSATION_CLOSED");
      }
      if (entry.owner !== userId) fail(404, "CONVERSATION_NOT_FOUND", "상담을 찾을 수 없습니다.");
      if (entry.closing) fail(409, "CONVERSATION_CLOSED");
      entry.cookie = cookie;
      entry.generation++;
      if (!entry.generating) armIdle(conversationId, entry);
      return { active: true };
    },
    async close(conversationId: string, userId: string, cookie: string): Promise<{ closed: true; saveStatus: SaveStatus }> {
      const entry = entries.get(conversationId);
      if (!entry) {
        const prior = findTombstone(conversationId, userId);
        if (prior) return { closed: true, saveStatus: prior.saveStatus };
        return fail(404, "CONVERSATION_NOT_FOUND", "상담을 찾을 수 없습니다.");
      }
      if (entry.owner !== userId) fail(404, "CONVERSATION_NOT_FOUND", "상담을 찾을 수 없습니다.");
      entry.cookie = cookie;
      return closeEntry(conversationId, entry, true);
    },
  };
}
