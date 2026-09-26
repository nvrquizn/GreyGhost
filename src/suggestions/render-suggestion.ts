import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import {
  isSuggestionVotingOpen,
  type Suggestion,
  type SuggestionStatus,
} from "../services/suggestions.js";

const statusDisplay: Record<SuggestionStatus, { label: string; color: number }> = {
  pending: { label: "Pending", color: 0xd3a73b },
  considering: { label: "Under Consideration", color: 0x5b8def },
  accepted: { label: "Accepted", color: 0x57a773 },
  denied: { label: "Denied", color: 0xc44d56 },
  implemented: { label: "Implemented", color: 0x9567c9 },
};

export function renderSuggestion(suggestion: Suggestion) {
  const status = statusDisplay[suggestion.status];
  const votingOpen = isSuggestionVotingOpen(suggestion.status);
  const embed = new EmbedBuilder()
    .setColor(status.color)
    .setTitle(`Petition · ${status.label}`)
    .setDescription(suggestion.body)
    .addFields(
      { name: "Submitter", value: `<@${suggestion.authorId}>`, inline: true },
      { name: "Status", value: `**${status.label}**`, inline: true },
      {
        name: "Results So Far",
        value: `✅ **${suggestion.upvotes.length}**\n❌ **${suggestion.downvotes.length}**`,
      },
    )
    .setThumbnail(suggestion.authorAvatarUrl)
    .setFooter({ text: `Petition ID: ${suggestion.id}` })
    .setTimestamp(suggestion.createdAt);

  if (suggestion.staffResponse) {
    const reviewDetails = suggestion.reviewedBy
      ? `\n\n— <@${suggestion.reviewedBy}>${suggestion.reviewedAt ? ` · <t:${Math.floor(suggestion.reviewedAt / 1000)}:R>` : ""}`
      : "";
    embed.addFields({
      name: "Staff Response",
      value: `${suggestion.staffResponse}${reviewDetails}`.slice(0, 1024),
    });
  }

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`petition:up:${suggestion.id}`)
      .setEmoji("✅")
      .setLabel(suggestion.upvotes.length.toString())
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!votingOpen),
    new ButtonBuilder()
      .setCustomId(`petition:down:${suggestion.id}`)
      .setEmoji("❌")
      .setLabel(suggestion.downvotes.length.toString())
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!votingOpen),
  );

  return { embed, row };
}
