import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Events,
  MessageFlags,
  type Client,
} from "discord.js";
import {
  castCouncilProposalVote,
  castStaffApplicationVote,
  createStaffApplication,
  getGuildSettings,
  updateCouncilProposal,
  updateStaffApplication,
} from "../services/guild-settings.js";
import { renderCouncilProposal, renderStaffApplication } from "./render.js";
import {
  buildStaffApplicationModal,
  clearStaffApplicationDraft,
  getStaffApplicationDraft,
  saveStaffApplicationPage,
} from "./staff-application-flow.js";

function continueRow(guildId: string, userId: string, nextPage: 2 | 3) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`staffapp:continue:${guildId}:${userId}:${nextPage}`)
      .setLabel(`Continue to Part ${nextPage}`)
      .setStyle(ButtonStyle.Primary),
  );
}

export function registerGovernanceInteractions(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isModalSubmit() && interaction.customId.startsWith("staffapp:page:")) {
      if (!interaction.inCachedGuild()) return;
      const [, , rawPage, guildId, userId] = interaction.customId.split(":");
      const page = Number(rawPage) as 1 | 2 | 3;
      if (!guildId || !userId || interaction.guildId !== guildId || interaction.user.id !== userId || ![1, 2, 3].includes(page)) {
        await interaction.reply({ content: "That staff application form is not yours.", flags: MessageFlags.Ephemeral });
        return;
      }
      const settings = await getGuildSettings(interaction.guildId);
      const governance = settings.governance;
      if (!governance) {
        await interaction.reply({ content: "Staff applications are no longer configured.", flags: MessageFlags.Ephemeral });
        return;
      }

      const draft = saveStaffApplicationPage(interaction, page);
      if (page < 3) {
        const nextPage = (page + 1) as 2 | 3;
        await interaction.reply({
          content: `Part **${page}/3** saved. Continue when you're ready. Your draft expires after one hour of inactivity.`,
          components: [continueRow(interaction.guildId, interaction.user.id, nextPage)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const channel = await interaction.guild.channels.fetch(governance.staffApplicationChannelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: "The staff-application channel is unavailable. Please notify the server owner.", flags: MessageFlags.Ephemeral });
        return;
      }
      const required = [
        draft.discordUsername, draft.timezone, draft.age16Plus, draft.experience, draft.availability,
        draft.scenarioSpam, draft.scenarioStaffMisconduct, draft.scenarioNsfw, draft.scenarioConflict,
        draft.inclusivity, draft.calmUnbiased, draft.motivation, draft.strengths, draft.uncertainty,
      ];
      if (required.some((value) => !value)) {
        await interaction.reply({ content: "Some earlier application answers expired or are missing. Please run `/staffapply` and start again.", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const application = await createStaffApplication(interaction.guildId, {
          applicantId: interaction.user.id,
          applicantName: interaction.user.globalName ?? interaction.user.username,
          applicantAvatarUrl: interaction.user.displayAvatarURL(),
          discordUsername: draft.discordUsername,
          timezone: draft.timezone,
          age16Plus: draft.age16Plus,
          motivation: draft.motivation!,
          experience: draft.experience!,
          availability: draft.availability!,
          strengths: draft.strengths!,
          scenarioSpam: draft.scenarioSpam,
          scenarioStaffMisconduct: draft.scenarioStaffMisconduct,
          scenarioNsfw: draft.scenarioNsfw,
          scenarioConflict: draft.scenarioConflict,
          inclusivity: draft.inclusivity,
          calmUnbiased: draft.calmUnbiased,
          uncertainty: draft.uncertainty,
          additional: draft.additional,
          channelId: channel.id,
        });
        const rendered = renderStaffApplication(application);
        const message = await channel.send({ embeds: rendered.embeds, components: rendered.rows });
        await updateStaffApplication(interaction.guildId, application.id, { messageId: message.id });
        clearStaffApplicationDraft(interaction.guildId, interaction.user.id);
        await interaction.editReply(`Your staff application **#${application.id}** was submitted privately.`);
      } catch (error) {
        await interaction.editReply(error instanceof Error && error.message === "PENDING_APPLICATION_EXISTS"
          ? "You already have a pending staff application. Wait for its final decision before applying again."
          : "Grey Ghost could not submit the application. Please try again.");
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("staffapp:continue:")) {
      if (!interaction.inCachedGuild()) return;
      const [, , guildId, userId, rawPage] = interaction.customId.split(":");
      const page = Number(rawPage) as 2 | 3;
      if (!guildId || !userId || interaction.guildId !== guildId || interaction.user.id !== userId || ![2, 3].includes(page)) {
        await interaction.reply({ content: "That application continuation is not yours.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (!getStaffApplicationDraft(guildId, userId)) {
        await interaction.reply({ content: "That application draft expired. Run `/staffapply` to start again.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.showModal(buildStaffApplicationModal(guildId, userId, page));
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
      await interaction.update({ embeds: rendered.embeds, components: rendered.rows });
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
      await interaction.update({ embeds: rendered.embeds, components: rendered.rows });
      const applicant = await interaction.client.users.fetch(updated.applicantId).catch(() => null);
      await applicant?.send(`Your staff application **#${updated.id}** for **${interaction.guild.name}** was **${updated.status}**.`).catch(() => undefined);
    }
  });
}
