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
import {
  saveSuggestion,
  updateSuggestionReview,
  type Suggestion,
  type SuggestionStatus,
} from "../services/suggestions.js";
import { renderSuggestion } from "../suggestions/render-suggestion.js";

export const petitionCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("petition")
    .setDescription("Submit or review a public petition.")
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand
      .setName("submit")
      .setDescription("Submit an idea for a public Realm vote.")
      .addStringOption((option) => option.setName("petition").setDescription("Describe your petition.").setMinLength(10).setMaxLength(3500).setRequired(true))
      .addAttachmentOption((option) => option.setName("image-1").setDescription("Optional supporting image."))
      .addAttachmentOption((option) => option.setName("image-2").setDescription("Optional supporting image."))
      .addAttachmentOption((option) => option.setName("image-3").setDescription("Optional supporting image."))
      .addAttachmentOption((option) => option.setName("image-4").setDescription("Optional supporting image.")))
    .addSubcommand((subcommand) => subcommand
      .setName("status")
      .setDescription("Owner only: decide or update a petition.")
      .addStringOption((option) => option.setName("petition-id").setDescription("The ID shown beneath the petition.").setMinLength(4).setMaxLength(32).setRequired(true))
      .addStringOption((option) => option.setName("status").setDescription("The new petition status.").setRequired(true).addChoices(
        { name: "Under Consideration", value: "considering" },
        { name: "Accepted", value: "accepted" },
        { name: "Denied", value: "denied" },
        { name: "Implemented", value: "implemented" },
        { name: "Reopen Voting", value: "pending" },
      ))
      .addStringOption((option) => option.setName("response").setDescription("Optional response displayed on the petition.").setMaxLength(900))),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "submit") {
      const settings = await getGuildSettings(interaction.guildId);
      const channelId = settings.governance?.petitionChannelId ?? settings.suggestionChannelId;
      if (!channelId) {
        await interaction.reply({ content: "Petitions are not configured. The server owner must run `/setup governance`.", flags: MessageFlags.Ephemeral });
        return;
      }
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased() || channel.type === ChannelType.GuildStageVoice) {
        await interaction.reply({ content: "The configured petitions channel is unavailable. Please notify staff.", flags: MessageFlags.Ephemeral });
        return;
      }
      const attachments = [1, 2, 3, 4]
        .map((number) => interaction.options.getAttachment(`image-${number}`))
        .filter((attachment): attachment is Attachment => Boolean(attachment));
      if (attachments.some((attachment) => !attachment.contentType?.startsWith("image/"))) {
        await interaction.reply({ content: "Every attachment must be an image.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const petition: Suggestion = {
        id: randomBytes(4).toString("hex"),
        guildId: interaction.guildId,
        channelId: channel.id,
        messageId: "pending",
        authorId: interaction.user.id,
        authorName: interaction.user.globalName ?? interaction.user.username,
        authorAvatarUrl: interaction.user.displayAvatarURL(),
        body: interaction.options.getString("petition", true),
        upvotes: [], downvotes: [], createdAt: Date.now(), status: "pending",
      };
      const rendered = renderSuggestion(petition);
      const message = await (channel as GuildTextBasedChannel).send({ embeds: [rendered.embed], components: [rendered.row], files: attachments });
      petition.messageId = message.id;
      await saveSuggestion(petition);
      await interaction.editReply(`Your petition has been posted in ${channel}.`);
      return;
    }

    if (interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({ content: "Only the server owner can make the final decision on a petition.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const petitionId = interaction.options.getString("petition-id", true).trim();
    const status = interaction.options.getString("status", true) as SuggestionStatus;
    const petition = await updateSuggestionReview(
      petitionId,
      interaction.guildId,
      status,
      interaction.options.getString("response") ?? undefined,
      interaction.user.id,
    );
    if (!petition) {
      await interaction.editReply("No petition with that ID exists in this server.");
      return;
    }
    const channel = await interaction.guild.channels.fetch(petition.channelId).catch(() => null);
    if (!channel?.isTextBased() || !("messages" in channel)) {
      await interaction.editReply("The decision was saved, but the original petition channel is unavailable.");
      return;
    }
    const message = await channel.messages.fetch(petition.messageId).catch(() => null);
    if (!message) {
      await interaction.editReply("The decision was saved, but the original petition message has been deleted.");
      return;
    }
    const rendered = renderSuggestion(petition);
    await message.edit({ embeds: [rendered.embed], components: [rendered.row] });
    await interaction.editReply(`Petition **${petition.id}** is now **${status}**: ${message.url}`);
  },
};
