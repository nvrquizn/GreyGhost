import { ChannelType, Events, MessageFlags, type Client } from "discord.js";
import {
  castCouncilProposalVote,
  castStaffApplicationVote,
  createStaffApplication,
  getGuildSettings,
  updateCouncilProposal,
  updateStaffApplication,
} from "../services/guild-settings.js";
import { renderCouncilProposal, renderStaffApplication } from "./render.js";

export function registerGovernanceInteractions(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isModalSubmit() && interaction.customId.startsWith("staffapp:form:")) {
      if (!interaction.inCachedGuild()) return;
      const settings = await getGuildSettings(interaction.guildId);
      const governance = settings.governance;
      if (!governance) {
        await interaction.reply({ content: "Staff applications are no longer configured.", flags: MessageFlags.Ephemeral });
        return;
      }
      const channel = await interaction.guild.channels.fetch(governance.staffApplicationChannelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: "The staff-application channel is unavailable. Please notify the server owner.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const application = await createStaffApplication(interaction.guildId, {
          applicantId: interaction.user.id,
          applicantName: interaction.user.globalName ?? interaction.user.username,
          applicantAvatarUrl: interaction.user.displayAvatarURL(),
          motivation: interaction.fields.getTextInputValue("motivation"),
          experience: interaction.fields.getTextInputValue("experience"),
          availability: interaction.fields.getTextInputValue("availability"),
          strengths: interaction.fields.getTextInputValue("strengths"),
          additional: interaction.fields.getTextInputValue("additional").trim() || undefined,
          channelId: channel.id,
        });
        const rendered = renderStaffApplication(application);
        const message = await channel.send({ embeds: [rendered.embed], components: rendered.rows });
        await updateStaffApplication(interaction.guildId, application.id, { messageId: message.id });
        await interaction.editReply(`Your staff application **#${application.id}** was submitted privately.`);
      } catch (error) {
        await interaction.editReply(error instanceof Error && error.message === "PENDING_APPLICATION_EXISTS"
          ? "You already have a pending staff application. Wait for its final decision before applying again."
          : "Grey Ghost could not submit the application. Please try again.");
      }
      return;
    }

    if (!interaction.isButton() || !interaction.inCachedGuild() || !interaction.customId.startsWith("governance:")) return;
    const [, recordType, action, rawId] = interaction.customId.split(":");
    const id = Number(rawId);
    if (!Number.isInteger(id) || !recordType || !action) return;
    const settings = await getGuildSettings(interaction.guildId);
    const governance = settings.governance;
    if (!governance) {
      await interaction.reply({ content: "Governance is no longer configured.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (recordType === "proposal") {
      const proposal = governance.proposals[String(id)];
      if (!proposal) {
        await interaction.reply({ content: "That council proposal is no longer available.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (proposal.status !== "pending") {
        await interaction.reply({ content: `That proposal has already been **${proposal.status}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      if (action === "yes" || action === "no") {
        if (!interaction.member.roles.cache.has(governance.councilRoleId) && interaction.user.id !== interaction.guild.ownerId) {
          await interaction.reply({ content: "Only members of the configured council role may vote.", flags: MessageFlags.Ephemeral });
          return;
        }
        const updated = await castCouncilProposalVote(interaction.guildId, id, interaction.user.id, action);
        if (!updated) return;
        const rendered = renderCouncilProposal(updated);
        await interaction.update({ embeds: [rendered.embed], components: rendered.rows });
        return;
      }
      if (action === "accept" || action === "deny") {
        if (interaction.user.id !== interaction.guild.ownerId) {
          await interaction.reply({ content: "Only the server owner can make the final decision.", flags: MessageFlags.Ephemeral });
          return;
        }
        const updated = await updateCouncilProposal(interaction.guildId, id, {
          status: action === "accept" ? "accepted" : "denied",
          decidedAt: Date.now(),
        });
        if (!updated) return;
        const rendered = renderCouncilProposal(updated);
        await interaction.update({ embeds: [rendered.embed], components: rendered.rows });
      }
      return;
    }

    if (recordType !== "application") return;
    const application = governance.applications[String(id)];
    if (!application) {
      await interaction.reply({ content: "That staff application is no longer available.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (application.status !== "pending") {
      await interaction.reply({ content: `That application has already been **${application.status}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === "yes" || action === "no") {
      if (!interaction.member.roles.cache.has(governance.councilRoleId) && interaction.user.id !== interaction.guild.ownerId) {
        await interaction.reply({ content: "Only members of the configured council/staff role may vote.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.user.id === application.applicantId) {
        await interaction.reply({ content: "Applicants cannot vote on their own application.", flags: MessageFlags.Ephemeral });
        return;
      }
      const updated = await castStaffApplicationVote(interaction.guildId, id, interaction.user.id, action);
      if (!updated) return;
      const rendered = renderStaffApplication(updated);
      await interaction.update({ embeds: [rendered.embed], components: rendered.rows });
      return;
    }
    if (action === "accept" || action === "deny") {
      if (interaction.user.id !== interaction.guild.ownerId) {
        await interaction.reply({ content: "Only the server owner can accept or deny staff applications.", flags: MessageFlags.Ephemeral });
        return;
      }
      const updated = await updateStaffApplication(interaction.guildId, id, {
        status: action === "accept" ? "accepted" : "denied",
        decidedAt: Date.now(),
      });
      if (!updated) return;
      const rendered = renderStaffApplication(updated);
      await interaction.update({ embeds: [rendered.embed], components: rendered.rows });
      const applicant = await interaction.client.users.fetch(updated.applicantId).catch(() => null);
      await applicant?.send(`Your staff application **#${updated.id}** for **${interaction.guild.name}** was **${updated.status}**.`).catch(() => undefined);
    }
  });
}
