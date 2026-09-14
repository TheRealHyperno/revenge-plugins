import { FluxDispatcher, ReactNative } from "@vendetta/metro/common";
import { findByStoreName, findByName } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { add, clear, deleted, history, log } from "./store";
import Settings from "./Settings";

const MessageStore = findByStoreName("MessageStore");
const ChannelStore = findByStoreName("ChannelStore");
const UserStore = findByStoreName("UserStore");
const RowManager = findByName("RowManager");

storage.logDeletes ??= true;
storage.logEdits ??= true;
storage.ignoreBots ??= false;
storage.ignoreSelf ??= false;
storage.ignoreUsers ??= "";
storage.ignoreChannels ??= "";
storage.ignoreGuilds ??= "";

export const BYPASS = "__ml_bypass";
const ids = (s: string) => s.split(/[\s,]+/).filter(Boolean);
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ");

function ignored(msg: any, channelId: string) {
  const guildId = ChannelStore.getChannel(channelId)?.guild_id;
  return (
    (storage.ignoreBots && msg.author?.bot) ||
    (storage.ignoreSelf && msg.author?.id === UserStore.getCurrentUser()?.id) ||
    ids(storage.ignoreUsers).includes(msg.author?.id) ||
    ids(storage.ignoreChannels).includes(channelId) ||
    (guildId && ids(storage.ignoreGuilds).includes(guildId))
  );
}

function entry(type: "edit" | "delete", msg: any, channelId: string, before: string, after?: string) {
  add({
    type,
    time: Date.now(),
    channelId,
    guildId: ChannelStore.getChannel(channelId)?.guild_id,
    messageId: msg.id,
    author: msg.author?.globalName ?? msg.author?.username ?? "unknown",
    authorId: msg.author?.id ?? "",
    before,
    after,
    attachments: (msg.attachments ?? []).map((a: any) => a.url),
  });
}

// Returns a replacement event (MESSAGE_UPDATE) that keeps the message in chat, or null to let the delete through.
function handleDelete(channelId: string, id: string) {
  const msg = MessageStore.getMessage(channelId, id);
  if (!msg || deleted.has(id) || ignored(msg, channelId)) return null;
  deleted.add(id);
  entry("delete", msg, channelId, history.get(id)?.real ?? msg.content ?? "");
  return { type: "MESSAGE_UPDATE", message: { id, channel_id: channelId, content: msg.content } };
}

let patches: (() => void)[] = [];

export const onLoad = () => {
  patches.push(
    before("dispatch", FluxDispatcher, (args) => {
      const event = args[0];
      if (!event || event[BYPASS]) return;
      try {
        if (event.type === "MESSAGE_DELETE" && storage.logDeletes) {
          const replacement = handleDelete(event.channelId, event.id);
          if (replacement) args[0] = replacement;
        } else if (event.type === "MESSAGE_DELETE_BULK" && storage.logDeletes) {
          const kept = (event.ids ?? []).filter((id: string) => handleDelete(event.channelId, id));
          if (kept.length) {
            kept.forEach((id: string) => {
              const msg = MessageStore.getMessage(event.channelId, id);
              FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id, channel_id: event.channelId, content: msg.content }, [BYPASS]: true });
            });
            args[0] = { ...event, ids: event.ids.filter((id: string) => !kept.includes(id)) };
          }
        } else if (event.type === "MESSAGE_UPDATE" && storage.logEdits && event.message?.id && typeof event.message.content === "string") {
          const { id, channel_id } = event.message;
          const msg = MessageStore.getMessage(channel_id, id);
          if (!msg || ignored(msg, channel_id)) return;
          const h = history.get(id) ?? { real: msg.content ?? "", old: [] };
          const next = event.message.content;
          if (next !== h.real) {
            entry("edit", msg, channel_id, h.real, next);
            h.old.push(h.real);
            h.real = next;
            history.set(id, h);
          }
          if (h.old.length) {
            // Show previous versions above the current text, like Vencord's "(edited)" history.
            const past = h.old.map((o) => `-# ~~${oneLine(o) || "(empty)"}~~ (edited)`).join("\n");
            args[0] = { ...event, message: { ...event.message, content: `${past}\n${next}` } };
          }
        }
      } catch (e) {
        console.error("[MessageLogger]", e);
      }
    })
  );

  // Highlight deleted messages red in chat.
  patches.push(
    after("generate", RowManager.prototype, ([data], row) => {
      if (data?.rowType !== 1 || !deleted.has(data.message?.id)) return;
      row.backgroundHighlight ??= {};
      row.backgroundHighlight.backgroundColor = ReactNative.processColor("#da373c22");
      row.backgroundHighlight.gutterColor = ReactNative.processColor("#da373cff");
      if (row.message) row.message.edited = "deleted";
    })
  );
};

// Actually remove the messages we kept in chat (used by "Clear" and on unload).
export function purgeDeleted() {
  for (const e of [...new Map(log.filter((x) => x.type === "delete").map((x) => [x.messageId, x])).values()]) {
    FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", channelId: e.channelId, id: e.messageId, [BYPASS]: true });
  }
  clear();
}


export const onUnload = () => {
  patches.forEach((p) => p());
  patches = [];
  purgeDeleted();
};

export const settings = Settings;
