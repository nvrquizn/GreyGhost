import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import type { CouncilProposal, StaffApplication } from "../services/guild-settings.js";

const statusLabel = { pending: "Pending", accepted: "Accepted", denied: "Denied" } as const;
const statusColor = { pending: 0xd4af37, accepted: 0x57a773, denied: 0xc44d56 } as const;

export function renderCouncilProposal(proposal: CouncilProposal) {
  const closed = proposal.status !== "pending";
  const embed = new EmbedBuilder()
    .setColor(statusColor[proposal.status])
    .setTitle(`Council Proposal #${proposal.id} · ${proposal.title}`)
    .setDescription(proposal.body)
    .addFields(
      { name: "Proposed by", value: `<@${proposal.authorId}>`, inline: true },
      { name: "Status", value: statusLabel[proposal.status], inline: true },
      { name: "Council Vote", value: `✅ **${proposal.yesVotes.length}**\n❌ **${proposal.noVotes.length}**` },
    )
    .setFooter({ text: "Council votes are advisory; only the server owner makes the final decision." })
    .setTimestamp(proposal.createdAt);
  const voteRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`governance:proposal:yes:${proposal.id}`).setEmoji("✅").setLabel(String(proposal.yesVotes.length)).setStyle(ButtonStyle.Secondary).setDisabled(closed),
    new ButtonBuilder().setCustomId(`governance:proposal:no:${proposal.id}`).setEmoji("❌").setLabel(String(proposal.noVotes.length)).setStyle(ButtonStyle.Secondary).setDisabled(closed),
  );
  const decisionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`governance:proposal:accept:${proposal.id}`).setLabel("Accept").setStyle(ButtonStyle.Success).setDisabled(closed),
    new ButtonBuilder().setCustomId(`governance:proposal:deny:${proposal.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger).setDisabled(closed),
  );
  return { embed, rows: [voteRow, decisionRow] };
}

export function renderStaffApplication(application: StaffApplication) {
  const closed = application.status !== "pending";
  const embed = new EmbedBuilder()
    .setColor(statusColor[application.status])
    .setTitle(`Staff Application #${application.id} · ${application.applicantName}`)
    .setThumbnail(application.applicantAvatarUrl)
    .addFields(
      { name: "Applicant", value: `<@${application.applicantId}> · \`${application.applicantId}\`` },
      { name: "Why do you want to join staff?", value: application.motivation },
      { name: "Relevant experience", value: application.experience },
      { name: "Availability and timezone", value: application.availability },
      { name: "Strengths and contribution", value: application.strengths },
      { name: "Additional information", value: application.additional || "None provided." },
      { name: "Staff Vote", value: `✅ Yes · **${application.yesVotes.length}**\n❌ No · **${application.noVotes.length}**`, inline: true },
      { name: "Final Status", value: statusLabel[application.status], inline: true },
    )
    .setFooter({ text: "Votes are advisory; only the server owner can accept or deny this application." })
    .setTimestamp(application.createdAt);
  const voteRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`governance:application:yes:${application.id}`).setEmoji("✅").setLabel(`Yes · ${application.yesVotes.length}`).setStyle(ButtonStyle.Secondary).setDisabled(closed),
    new ButtonBuilder().setCustomId(`governance:application:no:${application.id}`).setEmoji("❌").setLabel(`No · ${application.noVotes.length}`).setStyle(ButtonStyle.Secondary).setDisabled(closed),
  );
  const decisionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`governance:application:accept:${application.id}`).setLabel("Accept Application").setStyle(ButtonStyle.Success).setDisabled(closed),
    new ButtonBuilder().setCustomId(`governance:application:deny:${application.id}`).setLabel("Deny Application").setStyle(ButtonStyle.Danger).setDisabled(closed),
  );
  return { embed, rows: [voteRow, decisionRow] };
}
