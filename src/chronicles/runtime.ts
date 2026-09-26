import { EmbedBuilder, Events, type Client, type Guild } from "discord.js";
import {
  ensureServerCreationChronicle,
  getChronicleEntries,
  getGuildSettings,
  type ChronicleEntry,
} from "../services/guild-settings.js";
import { awardAchievement } from "../services/guild-settings.js";

const typeLabels = {
  server_creation: "Founding",
  house_season: "House Season",
  joust_champion: "Tourney Champion",
  melee_champion: "Grand Melee Champion",
  expedition_discovery: "Expedition Discovery",
  manual: "Realm Record",
} as const;

export function chronicleEmbed(entry: ChronicleEntry): EmbedBuilder {
  const people = entry.relatedUserIds.map((id) => `<@${id}>`).join(", ");
  const houses = entry.relatedRoleIds.map((id) => `<@&${id}>`).join(", ");
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(entry.title)
    .setDescription(entry.description)
    .addFields(
      { name: "Record", value: `#${entry.id} · ${typeLabels[entry.type]}`, inline: true },
      { name: "Date", value: `<t:${Math.floor(entry.occurredAt / 1000)}:F>`, inline: true },
    )
    .setFooter({ text: "The Chronicles of the Realm" })
    .setTimestamp(entry.occurredAt);
  if (people) embed.addFields({ name: "People", value: people.slice(0, 1024) });
  if (houses) embed.addFields({ name: "Houses", value: houses.slice(0, 1024) });
  return embed;
}

export async function publishChronicleEntry(guild: Guild, entry: ChronicleEntry): Promise<boolean> {
  const channelId = (await getGuildSettings(guild.id)).chronicleChannelId;
  if (!channelId) return false;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isSendable()) return false;
  return channel.send({ embeds: [chronicleEmbed(entry)] }).then(() => true).catch(() => false);
}

export function registerChronicleRuntime(client: Client): void {
  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      const existing = (await getChronicleEntries(guild.id)).some((entry) => entry.sourceKey === "server-creation");
      const entry = await ensureServerCreationChronicle(guild.id, guild.name, guild.createdTimestamp);
      await awardAchievement(guild.id, guild.ownerId, "realm-founder");
      if (!existing) await publishChronicleEntry(guild, entry);
    }
  });
}
