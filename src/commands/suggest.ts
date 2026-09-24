import { randomBytes } from "node:crypto";
import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  type Attachment,
  type GuildTextBasedChannel,
} from "discord.js";
import type { Command } from "../types/command.js";
import { getGuildSettings } from "../services/guild-settings.js";
import { saveSuggestion, type Suggestion } from "../services/suggestions.js";
import { renderSuggestion } from "../suggestions/render-suggestion.js";

function suggestionId(): string {
  return randomBytes(4).toString("hex");
}

export const suggestCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit an idea to the server suggestion channel.")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("suggestion")
        .setDescription("Describe your suggestion.")
        .setMinLength(10)
        .setMaxLength(3500)
        .setRequired(true),
    )
    .addAttachmentOption((option) =>
      option.setName("image-1").setDescription("Optional supporting image."),
    )
    .addAttachmentOption((option) =>
      option.setName("image-2").setDescription("Optional supporting image."),
    )
    .addAttachmentOption((option) =>
      option.setName("image-3").setDescription("Optional supporting image."),
    )
    .addAttachmentOption((option) =>
      option.setName("image-4").setDescription("Optional supporting image."),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    const settings = await getGuildSettings(interaction.guildId);
    if (!settings.suggestionChannelId) {
      await interaction.reply({
        content: "The suggestions channel has not been configured yet.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = await interaction.guild.channels
      .fetch(settings.suggestionChannelId)
      .catch(() => null);

    if (!channel?.isTextBased() || channel.type === ChannelType.GuildStageVoice) {
      await interaction.reply({
        content: "The configured suggestions channel is unavailable. Please notify staff.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const attachments = [1, 2, 3, 4]
      .map((number) => interaction.options.getAttachment(`image-${number}`))
      .filter((attachment): attachment is Attachment => Boolean(attachment));

    if (attachments.some((attachment) => !attachment.contentType?.startsWith("image/"))) {
      await interaction.reply({
        content: "Every attachment must be an image.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const suggestion: Suggestion = {
      id: suggestionId(),
      guildId: interaction.guildId,
      channelId: channel.id,
      messageId: "pending",
      authorId: interaction.user.id,
      authorName: interaction.user.globalName ?? interaction.user.username,
      authorAvatarUrl: interaction.user.displayAvatarURL(),
      body: interaction.options.getString("suggestion", true),
      upvotes: [],
      downvotes: [],
      createdAt: Date.now(),
      status: "pending",
    };

    const rendered = renderSuggestion(suggestion);
    const message = await (channel as GuildTextBasedChannel).send({
      embeds: [rendered.embed],
      components: [rendered.row],
      files: attachments,
    });

    suggestion.messageId = message.id;
    await saveSuggestion(suggestion);
    await interaction.editReply(`Your suggestion has been posted in ${channel}.`);
  },
};
