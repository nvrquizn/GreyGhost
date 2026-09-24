import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../types/command.js";
import {
  updateSuggestionReview,
  type SuggestionStatus,
} from "../services/suggestions.js";
import { renderSuggestion } from "../suggestions/render-suggestion.js";

export const suggestionCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("suggestion")
    .setDescription("Review a submitted server suggestion.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Update a suggestion's staff-review status.")
        .addStringOption((option) =>
          option
            .setName("suggestion-id")
            .setDescription("The ID shown at the bottom of the suggestion.")
            .setMinLength(4)
            .setMaxLength(32)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("status")
            .setDescription("The new status.")
            .setRequired(true)
            .addChoices(
              { name: "Under Consideration", value: "considering" },
              { name: "Accepted", value: "accepted" },
              { name: "Denied", value: "denied" },
              { name: "Implemented", value: "implemented" },
              { name: "Reopen Voting", value: "pending" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("response")
            .setDescription("Optional explanation displayed on the suggestion.")
            .setMaxLength(900),
        ),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        content: "You need **Manage Messages** to review suggestions.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const suggestionId = interaction.options.getString("suggestion-id", true).trim();
    const status = interaction.options.getString("status", true) as SuggestionStatus;
    const response = interaction.options.getString("response") ?? undefined;
    const suggestion = await updateSuggestionReview(
      suggestionId,
      interaction.guildId,
      status,
      response,
      interaction.user.id,
    );

    if (!suggestion) {
      await interaction.editReply("No suggestion with that ID exists in this server.");
      return;
    }

    const channel = await interaction.guild.channels.fetch(suggestion.channelId).catch(() => null);
    if (!channel?.isTextBased() || !("messages" in channel)) {
      await interaction.editReply(
        "The status was saved, but the original suggestion channel is unavailable.",
      );
      return;
    }

    const message = await channel.messages.fetch(suggestion.messageId).catch(() => null);
    if (!message) {
      await interaction.editReply(
        "The status was saved, but the original suggestion message has been deleted.",
      );
      return;
    }

    const rendered = renderSuggestion(suggestion);
    await message.edit({ embeds: [rendered.embed], components: [rendered.row] });
    await interaction.editReply(`Suggestion **${suggestion.id}** is now **${status}**: ${message.url}`);
  },
};
