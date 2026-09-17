// The small JSON contract shared by the member BFF and its browser client.
export type AccountEnvelope = {
  data: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  requestId: string;
};
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function isAccountEnvelope(value: unknown, status: number, path: string): value is AccountEnvelope {
  if (!object(value) || typeof value.requestId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value.requestId)) return false;
  if (status >= 400 && status <= 599) return value.data === null && object(value.error)
    && typeof value.error.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(value.error.code)
    && text(value.error.message) && value.error.message.length <= 1000;
  if (status < 200 || status >= 300 || value.error !== null || !object(value.data)) return false;
  const data = value.data;
  switch (path) {
    case "/api/auth/csrf": return text(data.token) && data.headerName === "X-CSRF-TOKEN";
    case "/api/auth/me": return text(data.userId) && text(data.email) && text(data.nickname);
    case "/api/signup": case "/api/auth/login": return text(data.userId);
    case "/api/auth/logout": return data.loggedOut === true;
    default: return false;
  }
}

const messages: Record<string, string> = {
  RATE_LIMITED: "요청이 많아요. 잠시 후 다시 시도해 주세요.",
  REQUEST_TOO_LARGE: "요청이 너무 커요. 입력 내용을 줄여 주세요.",
  INVALID_CREDENTIALS: "이메일 또는 비밀번호를 확인해 주세요.",
  AUTHENTICATION_REQUIRED: "로그인이 필요하거나 세션이 만료됐어요. 다시 로그인해 주세요.",
  CSRF_INVALID: "요청 정보가 만료됐어요. 다시 시도해 주세요.",
  EMAIL_IN_USE: "이미 가입된 이메일입니다. 로그인해 주세요.",
  VALIDATION_ERROR: "입력한 이메일·비밀번호·닉네임을 확인해 주세요.",
  BACKEND_TIMEOUT: "서버 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.",
  BACKEND_UNAVAILABLE: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  DATABASE_UNAVAILABLE: "일시적으로 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
  BACKEND_INVALID_RESPONSE: "서버 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  NETWORK_ERROR: "연결이 끊겼어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  REQUEST_TIMEOUT: "응답을 기다리는 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.",
  REQUEST_CANCELLED: "요청이 취소됐어요.",
  QA_AUTH_REQUIRED: "공유 페이지 접속 인증을 확인해 주세요. 페이지를 새로고침해 주세요.",
};
const validationMessages = new Set([
  "이메일 형식을 확인해 주세요.",
  "닉네임은 줄바꿈 없이 20자 이하로 입력해 주세요.",
  "비밀번호는 가입 시 8자 이상, UTF-8 72바이트 이하여야 합니다.",
]);
export function accountMessage(code: string, message?: string): string {
  if (code === "VALIDATION_ERROR" && message && validationMessages.has(message)) return message;
  return messages[code] ?? "요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
}
