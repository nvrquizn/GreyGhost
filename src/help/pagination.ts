import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type GuildMember,
} from "discord.js";
import { renderHelpPages } from "./render-help.js";

export function helpControls(userId: string, pageIndex: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  const previous = Math.max(0, pageIndex - 1);
  const next = Math.min(totalPages - 1, pageIndex + 1);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`help:${userId}:${previous}`)
      .setLabel("Previous")
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`help:${userId}:page`)
      .setLabel(`${pageIndex + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`help:${userId}:${next}`)
      .setLabel("Next")
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex >= totalPages - 1),
  );
}

export function helpPagePayload(member: GuildMember | null, isStaff: boolean, userId: string, pageIndex = 0) {
  const pages = renderHelpPages(member, isStaff);
  const safeIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
  const page = pages[safeIndex];
  if (!page) {
    throw new Error("Grey Ghost could not render a help page.");
  }
  return {
    embeds: [page],
    components: [helpControls(userId, safeIndex, pages.length)],
  };
}
