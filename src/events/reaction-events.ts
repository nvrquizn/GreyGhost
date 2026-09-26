import {
  ChannelType,
  EmbedBuilder,
  Events,
  type Client,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from "discord.js";
import { getGuildSettings } from "../services/guild-settings.js";

type ReactionAction = "added" | "removed";

function shorten(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

async function logReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  action: ReactionAction,
): Promise<void> {
  const actor = user.partial ? await user.fetch().catch(() => null) : user;
  if (!actor || actor.bot) return;

  const message = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;
  if (!message?.guild || !message.author) return;

  const settings = await getGuildSettings(message.guild.id);
  const logChannelId = settings.reactionLogChannelId;
  if (!logChannelId) return;

  const channel = await message.guild.channels
    .fetch(logChannelId)
    .catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const emoji = reaction.emoji.toString() || reaction.emoji.name || "Unknown emoji";
  const messageText = message.content.trim()
    ? shorten(message.content.trim(), 900)
    : "*No text content; the message may contain only an embed, sticker, or attachment.*";
  const actionLabel = action === "added" ? "Reaction added" : "Reaction removed";

  const embed = new EmbedBuilder()
    .setColor(action === "added" ? 0x82a67d : 0x8f4b4b)
    .setAuthor({ name: `${actionLabel} · ${actor.tag}`, iconURL: actor.displayAvatarURL() })
    .setDescription(`${actor} **${action}** ${emoji} on a message in ${message.channel}.`)
    .addFields(
      { name: "Member", value: `${actor}\n\`${actor.id}\``, inline: true },
      { name: "Message author", value: `${message.author}\n\`${message.author.id}\``, inline: true },
      { name: "Emoji", value: `${emoji}\n\`${reaction.emoji.id ?? reaction.emoji.name ?? "unknown"}\``, inline: true },
      { name: "Original message", value: `[Jump to message](${message.url})\n\`${message.id}\`` },
      { name: "Message content", value: messageText },
    )
    .setFooter({ text: action === "added" ? "A reaction was added" : "A reaction was removed" })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

export function registerReactionEvents(client: Client): void {
  client.on(Events.MessageReactionAdd, (reaction, user) => {
    void logReaction(reaction, user, "added").catch((error) => {
      console.error("Could not record an added reaction:", error);
    });
  });

  client.on(Events.MessageReactionRemove, (reaction, user) => {
    void logReaction(reaction, user, "removed").catch((error) => {
      console.error("Could not record a removed reaction:", error);
    });
  });
}
