// Only an opaque tab identifier is persisted; transcripts and member facts stay on the server.
const key = "eco.chat.active-session.v1";
export function storedChatSession(): string | undefined {
  try {
    const value = sessionStorage.getItem(key);
    return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
  } catch { return undefined; }
}
export function newChatSession(): string {
  const value = crypto.randomUUID();
  try { sessionStorage.setItem(key, value); } catch { /* Chat still works without browser storage. */ }
  return value;
}
export function forgetChatSession() {
  try { sessionStorage.removeItem(key); } catch { /* Browser storage may be disabled. */ }
}
