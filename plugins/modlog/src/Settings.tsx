import { React, ReactNative as RN, clipboard } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { log, subscribe, LogEntry } from "./store";
import { purgeDeleted } from "./index";

const { FormSection, FormRow, FormSwitchRow, FormInput, FormText, FormDivider } = Forms;

function format(e: LogEntry) {
  const head = `[${e.type.toUpperCase()}] ${new Date(e.time).toLocaleString()} — ${e.author} (${e.authorId}) in <#${e.channelId}>`;
  const body = e.type === "edit" ? `Before: ${e.before}\nAfter: ${e.after}` : `Content: ${e.before}`;
  return `${head}\n${body}${e.attachments.length ? `\nAttachments: ${e.attachments.join(" ")}` : ""}`;
}

export default function Settings() {
  useProxy(storage);
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const [filter, setFilter] = React.useState<"all" | "edit" | "delete">("all");
  React.useEffect(() => subscribe(force), []);
  const entries = log.filter((e) => filter === "all" || e.type === filter);

  const toggle = (key: string, label: string, sub?: string) => (
    <FormSwitchRow label={label} subLabel={sub} value={storage[key]} onValueChange={(v: boolean) => (storage[key] = v)} />
  );
  const list = (key: string, title: string) => (
    <FormInput title={title} placeholder="ids, comma separated" value={storage[key]} onChange={(v: string) => (storage[key] = v)} />
  );

  return (
    <RN.ScrollView style={{ flex: 1 }}>
      <FormSection title="Logging">
        {toggle("logDeletes", "Log deletes", "Keep deleted messages in chat, highlighted red")}
        {toggle("logEdits", "Log edits", "Show previous versions above edited messages")}
        {toggle("ignoreBots", "Ignore bots")}
        {toggle("ignoreSelf", "Ignore yourself")}
      </FormSection>
      <FormSection title="Ignore lists">
        {list("ignoreUsers", "Ignored users")}
        {list("ignoreChannels", "Ignored channels")}
        {list("ignoreGuilds", "Ignored servers")}
      </FormSection>
      <FormSection title="Log">
        <FormRow label={`Filter: ${filter}`} subLabel="Tap to cycle all / edit / delete"
          onPress={() => setFilter(filter === "all" ? "edit" : filter === "edit" ? "delete" : "all")} />
        <FormRow label="Copy log" onPress={() => { clipboard.setString(entries.map(format).join("\n\n")); showToast(`Copied ${entries.length} entries`); }} />
        <FormRow label="Clear log" subLabel="Also removes kept deleted messages from chat"
          onPress={() => { purgeDeleted(); showToast("Log cleared"); }} />
      </FormSection>
      <FormSection title={`Entries (${entries.length}) — cleared on restart`}>
        {entries.length === 0 && <FormText style={{ padding: 16 }}>Nothing logged yet.</FormText>}
        {entries.map((e, i) => (
          <React.Fragment key={`${e.messageId}-${e.time}-${i}`}>
            <FormRow
              label={`${e.type === "edit" ? "✏️ Edited" : "🗑️ Deleted"} · ${e.author}`}
              subLabel={(e.type === "edit" ? `${e.before || "(empty)"}\n→ ${e.after || "(empty)"}` : e.before || "(no text)") +
                (e.attachments.length ? `\n📎 ${e.attachments.length} attachment(s)` : "") +
                `\n${new Date(e.time).toLocaleTimeString()} · #${e.channelId}`}
              onPress={() => { clipboard.setString(format(e)); showToast("Entry copied"); }}
            />
            <FormDivider />
          </React.Fragment>
        ))}
      </FormSection>
    </RN.ScrollView>
  );
}
