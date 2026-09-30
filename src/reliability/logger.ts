import { EmbedBuilder, type Client, type Guild } from "discord.js";
import { getGuildSettings } from "../services/guild-settings.js";

function clip(value: string, max = 1000): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

function errorParts(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack };
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

function uptimeLabel(): string {
  const seconds = Math.max(0, Math.floor(process.uptime()));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

async function reliabilityChannel(guild: Guild) {
  const settings = await getGuildSettings(guild.id);
  if (!settings.reliabilityLogChannelId) return null;
  const channel = await guild.channels.fetch(settings.reliabilityLogChannelId).catch(() => null);
  return channel?.isTextBased() && channel.isSendable() ? channel : null;
}

export async function reportReliabilityError(
  client: Client,
  guildId: string | undefined,
  title: string,
  error: unknown,
  context?: string,
): Promise<void> {
  if (!guildId) return;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const channel = await reliabilityChannel(guild);
  if (!channel) return;

  const parts = errorParts(error);
  const embed = new EmbedBuilder()
    .setColor(0xe0a11b)
    .setTitle(`⚠️ ${clip(title, 240)}`)
    .addFields({ name: "Error", value: `\`${clip(parts.message.replace(/`/g, "'"), 950)}\`` });

  if (parts.stack) {
    embed.addFields({
      name: "Stack",
      value: `\`\`\`\n${clip(parts.stack.replace(/```/g, "'''"), 950)}\n\`\`\``,
    });
  }
  if (context) embed.addFields({ name: "Context", value: clip(context, 1000) });

  embed.setFooter({ text: `Grey Ghost Reliability • Uptime ${uptimeLabel()}` }).setTimestamp();
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
}

export async function reportRecovery(
  client: Client,
  guildId: string,
  title: string,
  context: string,
): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const channel = await reliabilityChannel(guild);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x57a773)
    .setTitle(`🛠️ ${clip(title, 240)}`)
    .setDescription(clip(context, 3500))
    .setFooter({ text: `Grey Ghost Reliability • Uptime ${uptimeLabel()}` })
    .setTimestamp();
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
}

export async function reportGlobalReliabilityError(
  client: Client,
  title: string,
  error: unknown,
  context?: string,
): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    await reportReliabilityError(client, guild.id, title, error, context);
  }
}
