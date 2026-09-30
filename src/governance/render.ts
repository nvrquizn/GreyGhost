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
  const answer = (value?: string) => {
    const text = value?.trim() || "Not provided.";
    return text.length > 700 ? `${text.slice(0, 697)}…` : text;
  };

  const first = new EmbedBuilder()
    .setColor(statusColor[application.status])
    .setTitle(`Staff Application #${application.id} · ${application.applicantName}`)
    .setThumbnail(application.applicantAvatarUrl)
    .addFields(
      { name: "Applicant", value: `<@${application.applicantId}> · \`${application.applicantId}\`` },
      { name: "1. Discord username", value: answer(application.discordUsername ?? application.applicantName), inline: true },
      { name: "2. Timezone", value: answer(application.timezone), inline: true },
      { name: "3. Are you 16 or older?", value: answer(application.age16Plus), inline: true },
      { name: "4. Prior moderation / management experience", value: answer(application.experience) },
      { name: "5. Availability", value: answer(application.availability) },
      { name: "6. Handling spam or disruptive behavior", value: answer(application.scenarioSpam) },
      { name: "7. Staff member acting inappropriately", value: answer(application.scenarioStaffMisconduct) },
    )
    .setFooter({ text: "Staff Application · Part 1 of 2" })
    .setTimestamp(application.createdAt);

  const second = new EmbedBuilder()
    .setColor(statusColor[application.status])
    .setTitle(`Staff Application #${application.id} · Continued`)
    .addFields(
      { name: "8. Someone posts NSFW speech", value: answer(application.scenarioNsfw) },
      { name: "9. Handling conflict", value: answer(application.scenarioConflict) },
      { name: "10. Promoting a positive and inclusive atmosphere", value: answer(application.inclusivity) },
      { name: "11. Staying calm and unbiased", value: answer(application.calmUnbiased) },
      { name: "12. Why do you want to join staff?", value: answer(application.motivation) },
      { name: "13. Strengths and contribution", value: answer(application.strengths) },
      { name: "14. What if the correct moderation action is unclear?", value: answer(application.uncertainty) },
      { name: "15. Additional information", value: answer(application.additional) },
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
  return { embeds: [first, second], rows: [voteRow, decisionRow] };
}
