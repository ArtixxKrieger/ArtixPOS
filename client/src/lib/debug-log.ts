const MAX_LOGS = 80;
const KEY = "artixpos_debug_log";

export interface DebugEntry {
  ts: string;
  tag: string;
  msg: string;
}

function now() {
  return new Date().toISOString().slice(11, 23);
}

export function debugLog(tag: string, msg: string) {
  console.log(`[${tag}] ${msg}`);
  try {
    const raw = sessionStorage.getItem(KEY);
    const entries: DebugEntry[] = raw ? JSON.parse(raw) : [];
    entries.push({ ts: now(), tag, msg });
    if (entries.length > MAX_LOGS) entries.splice(0, entries.length - MAX_LOGS);
    sessionStorage.setItem(KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event("artixpos-debug-update"));
  } catch {}
}

export function getDebugLogs(): DebugEntry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearDebugLogs() {
  try {
    sessionStorage.removeItem(KEY);
    window.dispatchEvent(new Event("artixpos-debug-update"));
  } catch {}
}
