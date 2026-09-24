import { Events, type Client, type Guild } from "discord.js";
import { getGuildSettings, updateGuildSettings } from "../services/guild-settings.js";
import { renderServerStats } from "./render-stats.js";

const refreshLocks = new Map<string, Promise<boolean>>();

async function refresh(guild: Guild): Promise<boolean> {
  const settings = await getGuildSettings(guild.id);
  if (!settings.statsChannelId) return false;

  const channel = await guild.channels.fetch(settings.statsChannelId).catch(() => null);
  if (!channel?.isTextBased() || !("messages" in channel)) return false;

  const embed = await renderServerStats(guild);
  const currentMessage = settings.statsMessageId
    ? await channel.messages.fetch(settings.statsMessageId).catch(() => null)
    : null;
  const message = currentMessage
    ? await currentMessage.edit({ embeds: [embed] })
    : await channel.send({ embeds: [embed] });

  if (message.id !== settings.statsMessageId) {
    await updateGuildSettings(guild.id, { statsChannelId: channel.id, statsMessageId: message.id });
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
