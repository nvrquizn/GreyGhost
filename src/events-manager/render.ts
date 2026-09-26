import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  time,
  TimestampStyles,
} from "discord.js";
import type { RealmEvent } from "../services/guild-settings.js";

const statusLabel = { open: "Open", completed: "Completed", cancelled: "Cancelled" } as const;
const statusColor = { open: 0x87ceeb, completed: 0x57a773, cancelled: 0xc44d56 } as const;

export function renderRealmEvent(event: RealmEvent) {
  const closed = event.status !== "open";
  const embed = new EmbedBuilder()
    .setColor(statusColor[event.status])
    .setTitle(`Event #${event.id} · ${event.title}`)
    .setDescription(event.description)
    .addFields(
      { name: "Begins", value: `${time(new Date(event.startsAt), TimestampStyles.LongDateTime)}\n${time(new Date(event.startsAt), TimestampStyles.RelativeTime)}`, inline: true },
      { name: "Host", value: `<@${event.hostId}>`, inline: true },
      { name: "Status", value: statusLabel[event.status], inline: true },
      { name: "Attendance", value: `⚔️ Going · **${event.going.length}**\n👁️ Interested · **${event.interested.length}**\n✖️ Cannot attend · **${event.declined.length}**` },
    )
    .setFooter({ text: "Choose one response below; press it again to remove it." })
    .setTimestamp(event.createdAt);
  if (event.location) embed.addFields({ name: "Location", value: event.location });
  if (event.podiumIds.length) {
    const medals = ["🥇", "🥈", "🥉"];
    embed.addFields({ name: "Podium", value: event.podiumIds.map((id, index) => `${medals[index]} <@${id}>`).join("\n") });
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`event:rsvp:going:${event.id}`).setEmoji("⚔️").setLabel(`Going · ${event.going.length}`).setStyle(ButtonStyle.Primary).setDisabled(closed),
    new ButtonBuilder().setCustomId(`event:rsvp:interested:${event.id}`).setEmoji("👁️").setLabel(`Interested · ${event.interested.length}`).setStyle(ButtonStyle.Secondary).setDisabled(closed),
    new ButtonBuilder().setCustomId(`event:rsvp:declined:${event.id}`).setEmoji("✖️").setLabel(`Cannot attend · ${event.declined.length}`).setStyle(ButtonStyle.Secondary).setDisabled(closed),
  );
  return { embed, row };
}
