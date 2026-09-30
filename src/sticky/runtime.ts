import { Events, type Client, type GuildTextBasedChannel, type Message } from "discord.js";
import { getGuildSettings, saveStickyMessage } from "../services/guild-settings.js";
import { suppressPersistentDeletion } from "../reliability/suppression.js";

const channelQueues = new Map<string, Promise<void>>();

async function refreshSticky(message: Message<true>): Promise<void> {
  if (message.author.bot || !message.guildId) return;
  const settings = await getGuildSettings(message.guildId);
  const sticky = settings.stickyMessages?.[message.channelId];
  if (!sticky) return;
  const channel = message.channel as GuildTextBasedChannel;
  if (!channel.isTextBased() || channel.isThread()) return;

  if (sticky.messageId) {
    suppressPersistentDeletion(sticky.messageId);
    await channel.messages.fetch(sticky.messageId).then((old) => old.delete()).catch(() => undefined);
  }

  const sent = await channel.send({ content: sticky.content, allowedMentions: { parse: [] } });
  await saveStickyMessage(message.guildId, message.channelId, { ...sticky, messageId: sent.id });
}

export function registerStickyRuntime(client: Client): void {
  client.on(Events.MessageCreate, (message) => {
    if (!message.inGuild() || message.author.bot) return;
    const key = `${message.guildId}:${message.channelId}`;
    const previous = channelQueues.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => refreshSticky(message))
      .catch((error) => console.error("Could not refresh sticky message:", error))
      .finally(() => {
        if (channelQueues.get(key) === next) channelQueues.delete(key);
      });
    channelQueues.set(key, next);
  });
}
