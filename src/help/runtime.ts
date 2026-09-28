import { Events, MessageFlags, type Client } from "discord.js";
import { getGuildSettings } from "../services/guild-settings.js";
import { helpPagePayload } from "./pagination.js";
import { isModmailStaffMember } from "../modmail/service.js";

export function registerHelpInteractions(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith("help:")) return;

    const [, ownerId, pageText] = interaction.customId.split(":");
    if (!ownerId || pageText === "page") return;

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "That command roster belongs to someone else. Use `/help` or `?help` to open your own.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const pageIndex = Number.parseInt(pageText ?? "0", 10);
    if (!Number.isFinite(pageIndex)) return;

    let isStaff = false;
    if (interaction.inCachedGuild()) {
      const settings = await getGuildSettings(interaction.guildId);
      isStaff = (await isModmailStaffMember(interaction.member, settings.modmail?.staffRoleId))
        || Boolean(settings.governance?.councilRoleId && interaction.member.roles.cache.has(settings.governance.councilRoleId));
    }

    await interaction.update(
      helpPagePayload(interaction.inCachedGuild() ? interaction.member : null, isStaff, ownerId, pageIndex),
    );
  });
}
