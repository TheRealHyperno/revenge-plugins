export type LogEntry = {
  type: "edit" | "delete";
  time: number;
  channelId: string;
  guildId?: string;
  messageId: string;
  author: string;
  authorId: string;
  before: string;
  after?: string;
  attachments: string[];
};

// Everything here lives in memory only, so it is wiped when the client restarts.
const MAX = 1000;
export const log: LogEntry[] = [];
export const deleted = new Set<string>(); // message ids shown as deleted in chat
export const history = new Map<string, { real: string; old: string[] }>(); // edit history per message id
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function add(entry: LogEntry) {
  log.unshift(entry);
  if (log.length > MAX) log.length = MAX;
  emit();
}

export function clear() {
  log.length = 0;
  deleted.clear();
  history.clear();
  emit();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
