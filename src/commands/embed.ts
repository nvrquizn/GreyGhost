import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ColorResolvable,
  type GuildTextBasedChannel,
} from "discord.js";
import type { Command } from "../types/command.js";

function parseColor(value?: string | null): ColorResolvable {
  if (!value) return 0x9da8b5;
  const normalized = value.trim().replace(/^#/, "");

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error("INVALID_COLOR");
  }

  return Number.parseInt(normalized, 16);
}

export const embedCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Send a formatted information embed.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Where the embed should be sent.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("The embed title.")
        .setMaxLength(256)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("body")
        .setDescription("The embed text; Discord Markdown is supported.")
        .setMaxLength(4000)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("color")
        .setDescription("Optional six-digit hex color, such as 9DA8B5."),
    )
    .addAttachmentOption((option) =>
      option.setName("banner").setDescription("Optional image displayed above the text embed."),
    )
    .addStringOption((option) =>
      option.setName("footer").setDescription("Optional footer text.").setMaxLength(2048),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    const channel = interaction.options.getChannel("channel", true) as GuildTextBasedChannel;
    const title = interaction.options.getString("title", true);
    const body = interaction.options.getString("body", true);
    const footer = interaction.options.getString("footer");
    const banner = interaction.options.getAttachment("banner");
    let color: ColorResolvable;

    try {
      color = parseColor(interaction.options.getString("color"));
    } catch {
      await interaction.reply({
        content: "Use a six-digit hex color such as `9DA8B5` or `#9DA8B5`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (banner && !banner.contentType?.startsWith("image/")) {
      await interaction.reply({
        content: "The banner attachment must be an image.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (banner) {
      const bannerEmbed = new EmbedBuilder().setColor(color).setImage(`attachment://${banner.name}`);
      await channel.send({ embeds: [bannerEmbed], files: [banner] });
    }

    const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(body);
    if (footer) embed.setFooter({ text: footer });
    await channel.send({ embeds: [embed] });

    await interaction.editReply(`The embed has been sent to ${channel}.`);
  },
};
