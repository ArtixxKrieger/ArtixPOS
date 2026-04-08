let USER_ID = "";
let SESSIONS_KEY = "artixpos_ai_sessions";
const FLOAT_KEY = "artixpos_ai_float_enabled";
const ICON_SIZE_KEY = "artixpos_ai_icon_size";
const ICON_OPACITY_KEY = "artixpos_ai_icon_opacity";
const FLOAT_DRAGGABLE_KEY = "artixpos_ai_float_draggable";
const FLOAT_POSITION_KEY = "artixpos_ai_float_position";

export function initAiStore(userId: string) {
  if (USER_ID === userId) return;
  USER_ID = userId;
  SESSIONS_KEY = `artixpos_ai_sessions_${userId}`;
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  file?: { name: string; size: number };
  silent?: boolean;
}

export interface AiSession {
  id: string;
  title: string;
  messages: AiMessage[];
  createdAt: string;
  updatedAt: string;
}

function load(): AiSession[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]");
  } catch {
    return [];
  }
}

function save(sessions: AiSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function getSessions(): AiSession[] {
  return load().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSession(id: string): AiSession | null {
  return load().find(s => s.id === id) ?? null;
}

export function createSession(): AiSession {
  const session: AiSession = {
    id: crypto.randomUUID(),
    title: "New Chat",
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const sessions = load();
  sessions.unshift(session);
  save(sessions);
  return session;
}

export function updateSession(id: string, messages: AiMessage[]) {
  const sessions = load();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return;

  const firstUserMsg = messages.find(m => m.role === "user");
  const title = firstUserMsg
    ? firstUserMsg.content.slice(0, 45) + (firstUserMsg.content.length > 45 ? "…" : "")
    : "New Chat";

  sessions[idx] = {
    ...sessions[idx],
    title,
    messages,
    updatedAt: new Date().toISOString(),
  };
  save(sessions);
}

export function deleteSession(id: string) {
  save(load().filter(s => s.id !== id));
}

export function clearAllSessions() {
  save([]);
}

export function getFloatEnabled(): boolean {
  const val = localStorage.getItem(FLOAT_KEY);
  return val === null ? true : val === "true";
}

export function setFloatEnabled(enabled: boolean) {
  localStorage.setItem(FLOAT_KEY, String(enabled));
}

export function getIconSize(): number {
  const val = localStorage.getItem(ICON_SIZE_KEY);
  return val === null ? 56 : Math.max(36, Math.min(80, parseInt(val, 10)));
}

export function setIconSize(size: number) {
  localStorage.setItem(ICON_SIZE_KEY, String(size));
}

export function getIconOpacity(): number {
  const val = localStorage.getItem(ICON_OPACITY_KEY);
  return val === null ? 100 : Math.max(20, Math.min(100, parseInt(val, 10)));
}

export function setIconOpacity(opacity: number) {
  localStorage.setItem(ICON_OPACITY_KEY, String(opacity));
}

export function getFloatDraggable(): boolean {
  const val = localStorage.getItem(FLOAT_DRAGGABLE_KEY);
  return val === null ? false : val === "true";
}

export function setFloatDraggable(enabled: boolean) {
  localStorage.setItem(FLOAT_DRAGGABLE_KEY, String(enabled));
}

export interface FloatPosition { x: number; y: number }

export function getFloatPosition(): FloatPosition | null {
  try {
    const val = localStorage.getItem(FLOAT_POSITION_KEY);
    if (!val) return null;
    return JSON.parse(val) as FloatPosition;
  } catch {
    return null;
  }
}

export function setFloatPosition(pos: FloatPosition) {
  localStorage.setItem(FLOAT_POSITION_KEY, JSON.stringify(pos));
}

export function clearFloatPosition() {
  localStorage.removeItem(FLOAT_POSITION_KEY);
}

export function groupSessionsByDate(sessions: AiSession[]): Record<string, AiSession[]> {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const groups: Record<string, AiSession[]> = {};

  for (const s of sessions) {
    const d = new Date(s.updatedAt).toDateString();
    let label: string;
    if (d === today) label = "Today";
    else if (d === yesterday) label = "Yesterday";
    else {
      const date = new Date(s.updatedAt);
      label = date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(s);
  }
  return groups;
}
