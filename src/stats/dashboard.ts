import { Events, type Client, type Guild, type Message } from "discord.js";
import { getGuildSettings, updateGuildSettings } from "../services/guild-settings.js";
import { renderServerStatsPages } from "./render-stats.js";
import { suppressPersistentDeletion } from "../reliability/suppression.js";

const refreshLocks = new Map<string, Promise<boolean>>();

async function refresh(guild: Guild): Promise<boolean> {
  const settings = await getGuildSettings(guild.id);
  if (!settings.statsChannelId) return false;

  const channel = await guild.channels.fetch(settings.statsChannelId).catch(() => null);
  if (!channel?.isTextBased() || !("messages" in channel)) return false;

  const pages = await renderServerStatsPages(guild);
  const configuredIds = settings.statsMessageIds?.length
    ? settings.statsMessageIds
    : settings.statsMessageId
      ? [settings.statsMessageId]
      : [];
  const existing = await Promise.all(
    configuredIds.map((id) => channel.messages.fetch(id).catch(() => null)),
  );
  const pageMessages: Message[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (!page) continue;
    const current = existing[index];
    const message = current
      ? await current.edit({ embeds: [page] })
      : await channel.send({ embeds: [page] });
    pageMessages.push(message);
  }

  for (const extra of existing.slice(pages.length)) {
    if (extra) {
      suppressPersistentDeletion(extra.id);
      await extra.delete().catch(() => undefined);
    }
  }

  const ids = pageMessages.map((message) => message.id);
  const idsChanged = ids.length !== configuredIds.length || ids.some((id, index) => id !== configuredIds[index]);
  if (idsChanged || settings.statsMessageId !== ids[0]) {
    await updateGuildSettings(guild.id, {
      statsChannelId: channel.id,
      statsMessageId: ids[0],
      statsMessageIds: ids,
    });
  }
  return true;
}

export function refreshStatsDashboard(guild: Guild): Promise<boolean> {
  const previous = refreshLocks.get(guild.id) ?? Promise.resolve(false);
  const current = previous.catch(() => false).then(() => refresh(guild));
  refreshLocks.set(guild.id, current);
  const release = () => {
    if (refreshLocks.get(guild.id) === current) refreshLocks.delete(guild.id);
  };
  void current.then(release, release);
  return current;
}

export function registerStatsDashboard(client: Client): void {
  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      await refreshStatsDashboard(guild).catch((error) => {
        console.error(`Could not refresh statistics for ${guild.id}:`, error);
      });
    }

    const timer = setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        void refreshStatsDashboard(guild).catch((error) => {
          console.error(`Could not refresh statistics for ${guild.id}:`, error);
        });
      }
    }, 15 * 60 * 1000);
    timer.unref();
  });
}
