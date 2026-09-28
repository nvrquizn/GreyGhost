import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { getGuildSettings, updateModmailTicket } from "../services/guild-settings.js";
import { closeTicket, findTicketByChannel, isModmailStaffMember, refreshTicketHeader, reopenTicket, sendAnonymousReply, ticketLabel } from "../modmail/service.js";

export const modmailCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("modmail")
    .setDescription("Reply to and manage the modmail ticket in this channel.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("reply").setDescription("Reply anonymously to the member through Grey Ghost.")
      .addStringOption((option) => option.setName("message").setDescription("The reply sent to the member.").setMaxLength(2000).setRequired(true))
      .addAttachmentOption((option) => option.setName("attachment").setDescription("An optional attachment.")))
    .addSubcommand((sub) => sub.setName("claim").setDescription("Mark this ticket as claimed by you."))
    .addSubcommand((sub) => sub.setName("close").setDescription("Close this ticket and save its transcript.")
      .addStringOption((option) => option.setName("reason").setDescription("Why the ticket is being closed.").setMaxLength(500)))
    .addSubcommand((sub) => sub.setName("reopen").setDescription("Reopen this ticket."))
    .addSubcommand((sub) => sub.setName("info").setDescription("Show this ticket's saved information.")),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const settings = await getGuildSettings(interaction.guildId);
    const config = settings.modmail;
    const ticket = await findTicketByChannel(interaction.guildId, interaction.channelId);
    if (!config || !ticket) {
      await interaction.reply({ content: "This is not a configured modmail ticket channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    const allowed = await isModmailStaffMember(interaction.member, config.staffRoleId);
    if (!allowed) {
      await interaction.reply({ content: "Only the configured modmail staff can use this command.", flags: MessageFlags.Ephemeral });
      return;
    }
    const action = interaction.options.getSubcommand();
    if (action === "info") {
      await interaction.reply({ content: `**Ticket ${ticketLabel(ticket.id)}**\nMember: <@${ticket.userId}> (\`${ticket.userId}\`)\nCategory: ${ticket.category}\nSubject: ${ticket.subject}\nStatus: ${ticket.status}\nClaimed by: ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Nobody"}`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === "reopen") {
      if (ticket.status === "deleted") {
        await interaction.reply({ content: "That ticket was permanently deleted and cannot be reopened.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (ticket.status === "open") {
        await interaction.reply({ content: "That ticket is already open.", flags: MessageFlags.Ephemeral });
        return;
      }
      await reopenTicket(interaction.guild, ticket, interaction.user.id);
      await interaction.reply({ content: "Ticket reopened.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (ticket.status !== "open") {
      await interaction.reply({ content: "That ticket is closed. Use `/modmail reopen` first.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === "claim") {
      const updated = await updateModmailTicket(interaction.guildId, ticket.id, { claimedBy: interaction.user.id });
      if (updated) await refreshTicketHeader(interaction.guild, updated);
      await interaction.reply(`${interaction.user} claimed ticket ${ticketLabel(ticket.id)}. This identity remains staff-only.`);
      const user = await interaction.client.users.fetch(ticket.userId).catch(() => null);
      await user?.send(`Grey Ghost's staff have opened and begun reviewing ticket **${ticketLabel(ticket.id)}**.`).catch(() => undefined);
      return;
    }
    if (action === "close") {
      await interaction.deferReply();
      await closeTicket(interaction.guild, ticket, interaction.user.id, interaction.options.getString("reason") ?? "No reason provided.");
      await interaction.editReply(`Ticket ${ticketLabel(ticket.id)} was closed and its transcript was logged.`);
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const attachment = interaction.options.getAttachment("attachment");
    await sendAnonymousReply(interaction.guild, ticket, interaction.user.id, interaction.options.getString("message", true), attachment ? { url: attachment.url, name: attachment.name } : undefined);
    await interaction.editReply(`Anonymous reply sent for ticket ${ticketLabel(ticket.id)}.`);
  },
};
