import { Events, type Client, type Guild } from "discord.js";
import {
  getGuildSettings,
  saveSelfRolePanel,
  saveStickyMessage,
  updateRealmEvent,
} from "../services/guild-settings.js";
import { renderSelfRolePanel } from "../selfroles/render-panel.js";
import { isSelfRolePanelId } from "../selfroles/panels.js";
import { refreshStatsDashboard } from "../stats/dashboard.js";
import { renderRealmEvent } from "../events-manager/render.js";
import { reportRecovery, reportReliabilityError } from "./logger.js";
import { consumePersistentDeletionSuppression } from "./suppression.js";

async function recoverSticky(guild: Guild, channelId: string, deletedId?: string): Promise<boolean> {
  const settings = await getGuildSettings(guild.id);
  const sticky = settings.stickyMessages?.[channelId];
  if (!sticky || (deletedId && sticky.messageId !== deletedId)) return false;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable() || !("messages" in channel)) return false;

  if (!deletedId && sticky.messageId) {
    const existing = await channel.messages.fetch(sticky.messageId).catch(() => null);
    if (existing) return false;
  }

  const sent = await channel.send({ content: sticky.content, allowedMentions: { parse: [] } });
  await saveStickyMessage(guild.id, channelId, { ...sticky, messageId: sent.id });
  await reportRecovery(
    guild.client,
    guild.id,
    "Sticky message recovered",
    `Rebuilt the sticky message in <#${channelId}> after its stored message disappeared.`,
  );
  return true;
}

async function recoverSelfRolePanels(guild: Guild, deletedId?: string): Promise<boolean> {
  const settings = await getGuildSettings(guild.id);
  let recovered = false;

  for (const [panelId, panel] of Object.entries(settings.selfRolePanels ?? {})) {
    if (!isSelfRolePanelId(panelId) || !panel.channelId || !panel.messageId) continue;
    if (deletedId && panel.messageId !== deletedId) continue;

    const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.isSendable() || !("messages" in channel)) continue;

    if (!deletedId) {
      const existing = await channel.messages.fetch(panel.messageId).catch(() => null);
      if (existing) continue;
    }

    const rendered = renderSelfRolePanel(guild, panelId, panel);
    const sent = await channel.send({ embeds: [rendered.embed], components: rendered.rows });
    await saveSelfRolePanel(guild.id, panelId, { ...panel, messageId: sent.id });
    await reportRecovery(
      guild.client,
      guild.id,
      "Self-role panel recovered",
      `Rebuilt **${panel.title}** in <#${panel.channelId}>.`,
    );
    recovered = true;
  }

  return recovered;
}

async function recoverRealmEvents(guild: Guild, deletedId?: string): Promise<boolean> {
  const settings = await getGuildSettings(guild.id);
  let recovered = false;

  for (const event of Object.values(settings.events?.entries ?? {})) {
    if (!event.messageId || event.messageId === "pending") continue;
    if (deletedId && event.messageId !== deletedId) continue;

    const channel = await guild.channels.fetch(event.channelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.isSendable() || !("messages" in channel)) continue;

    if (!deletedId) {
      const existing = await channel.messages.fetch(event.messageId).catch(() => null);
      if (existing) continue;
    }

    const rendered = renderRealmEvent(event);
    const sent = await channel.send({ embeds: [rendered.embed], components: [rendered.row] });
    await updateRealmEvent(guild.id, event.id, { messageId: sent.id });
    await reportRecovery(
      guild.client,
      guild.id,
      "Event panel recovered",
      `Rebuilt **Event #${event.id} · ${event.title}** in <#${event.channelId}>.`,
    );
    recovered = true;
  }

  return recovered;
}

async function recoverStatsIfNeeded(guild: Guild, deletedId?: string): Promise<boolean> {
  const settings = await getGuildSettings(guild.id);
  const ids = settings.statsMessageIds?.length
    ? settings.statsMessageIds
    : settings.statsMessageId
      ? [settings.statsMessageId]
      : [];
  if (!settings.statsChannelId || !ids.length) return false;
  if (deletedId && !ids.includes(deletedId)) return false;

  if (!deletedId) {
    const channel = await guild.channels.fetch(settings.statsChannelId).catch(() => null);
    if (!channel?.isTextBased() || !("messages" in channel)) return false;
    const found = await Promise.all(ids.map((id) => channel.messages.fetch(id).catch(() => null)));
    if (found.every(Boolean)) return false;
  }

  const ok = await refreshStatsDashboard(guild);
  if (ok) {
    await reportRecovery(
      guild.client,
      guild.id,
      "Statistics dashboard recovered",
      `Rebuilt missing statistics dashboard page(s) in <#${settings.statsChannelId}>.`,
    );
  }
  return ok;
}

async function recoverGuild(guild: Guild): Promise<void> {
  const settings = await getGuildSettings(guild.id);
  for (const channelId of Object.keys(settings.stickyMessages ?? {})) {
    await recoverSticky(guild, channelId);
  }
  await recoverSelfRolePanels(guild);
  await recoverRealmEvents(guild);
  await recoverStatsIfNeeded(guild);
}

export function registerReliabilityRecovery(client: Client): void {
  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      await recoverGuild(guild).catch((error) => {
        console.error(`Persistent recovery failed for ${guild.id}:`, error);
        void reportReliabilityError(
          client,
          guild.id,
          "Persistent recovery failed",
          error,
          `Guild: ${guild.name} (${guild.id})`,
        );
      });
    }
  });

  client.on(Events.MessageDelete, async (message) => {
    if (!message.guildId || consumePersistentDeletionSuppression(message.id)) return;
    const guild = client.guilds.cache.get(message.guildId);
    if (!guild) return;

    try {
      if (await recoverSticky(guild, message.channelId, message.id)) return;
      if (await recoverSelfRolePanels(guild, message.id)) return;
      if (await recoverRealmEvents(guild, message.id)) return;
      await recoverStatsIfNeeded(guild, message.id);
    } catch (error) {
      console.error("Automatic persistent-message recovery failed:", error);
      await reportReliabilityError(
        client,
        guild.id,
        "Automatic recovery failed",
        error,
        `Deleted message: ${message.id}\nChannel: <#${message.channelId}>`,
      );
    }
  });
}
