import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../types/command.js";
import {
  clearGuildSetting,
  getGuildSettings,
  updateGuildSettings,
  type GuildSettings,
} from "../services/guild-settings.js";
import { diagnoseGuildSetup } from "../services/setup-diagnostics.js";

function diagnosticList(items: string[], empty: string): string {
  if (!items.length) return empty;
  const visible = items.slice(0, 10).map((item) => `• ${item}`);
  if (items.length > visible.length) visible.push(`• …and ${items.length - visible.length} more.`);
  return visible.join("\n").slice(0, 1024);
}

function settingsSummary(settings: GuildSettings): string {
  return [
    `**Welcome channel:** ${settings.welcomeChannelId ? `<#${settings.welcomeChannelId}>` : "Not configured"}`,
    `**Join/leave log:** ${settings.logChannelId ? `<#${settings.logChannelId}>` : "Not configured"}`,
    `**Newcomer role:** ${settings.newcomerRoleId ? `<@&${settings.newcomerRoleId}>` : "Not configured"}`,
    `**Suggestions channel:** ${settings.suggestionChannelId ? `<#${settings.suggestionChannelId}>` : "Not configured"}`,
    `**Collection announcements:** ${settings.collectionAnnouncementChannelId ? `<#${settings.collectionAnnouncementChannelId}>` : "Not configured"}`,
    `**Modmail:** ${settings.modmail ? `tickets in <#${settings.modmail.categoryId}> · staff <@&${settings.modmail.staffRoleId}> · logs <#${settings.modmail.logChannelId}>` : "Not configured"}`,
    `**Moderation logs:** ${settings.moderation ? `<#${settings.moderation.logChannelId}>` : "Not configured"}`,
  ].join("\n");
}

export const setupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure Grey Ghost for this server.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("onboarding")
        .setDescription("Configure welcomes, logs, and the automatic newcomer role.")
        .addChannelOption((option) =>
          option
            .setName("welcome-channel")
            .setDescription("Where public welcome messages will be sent.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("log-channel")
            .setDescription("Where private join and leave logs will be sent.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("newcomer-role")
            .setDescription("The role automatically given to new members, such as Smallfolk.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("suggestions")
        .setDescription("Choose where member suggestions will be posted.")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The server suggestions channel.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("collections")
        .setDescription("Choose where newly completed collection titles are announced.")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The collection-title announcement channel.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("modmail")
        .setDescription("Configure private DM-based staff tickets.")
        .addChannelOption((option) =>
          option.setName("ticket-category").setDescription("The private category where ticket channels are created.").addChannelTypes(ChannelType.GuildCategory).setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName("staff-role").setDescription("The staff role allowed to see and reply to tickets.").setRequired(true),
        )
        .addChannelOption((option) =>
          option.setName("log-channel").setDescription("The private channel that receives closed-ticket transcripts.").addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("moderation")
        .setDescription("Choose where moderation cases are recorded.")
        .addChannelOption((option) =>
          option.setName("log-channel").setDescription("The private channel for moderation cases.").addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("check").setDescription("Check Grey Ghost's setup and permissions."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("view").setDescription("View the current Grey Ghost settings."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Disable one or all onboarding settings.")
        .addStringOption((option) =>
          option
            .setName("setting")
            .setDescription("The setting to clear.")
            .setRequired(true)
            .addChoices(
              { name: "Welcome channel", value: "welcomeChannelId" },
              { name: "Join/leave log", value: "logChannelId" },
              { name: "Newcomer role", value: "newcomerRoleId" },
              { name: "Suggestions channel", value: "suggestionChannelId" },
              {
                name: "Collection announcements",
                value: "collectionAnnouncementChannelId",
              },
              { name: "Modmail", value: "modmail" },
              { name: "Moderation records", value: "moderation" },
              { name: "All basic server settings", value: "all" },
            ),
        ),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: "This command can only be used inside the server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "check") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const diagnostics = await diagnoseGuildSetup(interaction.guild);
      const embed = new EmbedBuilder()
        .setColor(diagnostics.errors.length ? 0xc44d56 : diagnostics.warnings.length ? 0xd4af37 : 0x6fa36f)
        .setTitle("Grey Ghost · Setup Check")
        .setDescription(
          diagnostics.errors.length
            ? `Found **${diagnostics.errors.length} error(s)** and **${diagnostics.warnings.length} warning(s)**.`
            : `No blocking errors found. **${diagnostics.warnings.length} warning(s)** remain.`,
        )
        .addFields(
          {
            name: `Errors · ${diagnostics.errors.length}`,
            value: diagnosticList(diagnostics.errors, "None."),
          },
          {
            name: `Warnings · ${diagnostics.warnings.length}`,
            value: diagnosticList(diagnostics.warnings, "None."),
          },
          {
            name: `Passed · ${diagnostics.passed.length}`,
            value: diagnosticList(diagnostics.passed, "No configured features were checked."),
          },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === "view") {
      const settings = await getGuildSettings(interaction.guildId);
      await interaction.reply({
        content: `## Grey Ghost Setup\n${settingsSummary(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "clear") {
      const target = interaction.options.getString("setting", true) as
        | keyof GuildSettings
        | "all";
      const settings = await clearGuildSetting(interaction.guildId, target);

      await interaction.reply({
        content: `The selected setting has been cleared.\n\n${settingsSummary(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "suggestions") {
      const channel = interaction.options.getChannel("channel", true);
      const settings = await updateGuildSettings(interaction.guildId, {
        suggestionChannelId: channel.id,
      });

      await interaction.reply({
        content: `Suggestions will now be posted in ${channel}.\n\n${settingsSummary(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "collections") {
      const channel = interaction.options.getChannel("channel", true);
      const settings = await updateGuildSettings(interaction.guildId, {
        collectionAnnouncementChannelId: channel.id,
      });

      await interaction.reply({
        content: `Newly earned collection titles will be announced in ${channel}.\n\n${settingsSummary(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "modmail") {
      const category = interaction.options.getChannel("ticket-category", true);
      const staffRole = interaction.options.getRole("staff-role", true);
      const logChannel = interaction.options.getChannel("log-channel", true);
      if (staffRole.id === interaction.guild.roles.everyone.id) {
        await interaction.reply({ content: "Choose a private staff role—not @everyone—for modmail access.", flags: MessageFlags.Ephemeral });
        return;
      }
      const current = await getGuildSettings(interaction.guildId);
      const settings = await updateGuildSettings(interaction.guildId, {
        modmail: {
          categoryId: category.id,
          staffRoleId: staffRole.id,
          logChannelId: logChannel.id,
          nextTicketNumber: current.modmail?.nextTicketNumber ?? 1,
          tickets: current.modmail?.tickets ?? {},
        },
      });
      await interaction.reply({
        content: `Modmail is configured. New tickets will be created beneath ${category}; ${staffRole} can respond, and transcripts will be saved in ${logChannel}.\n\n${settingsSummary(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "moderation") {
      const logChannel = interaction.options.getChannel("log-channel", true);
      const current = await getGuildSettings(interaction.guildId);
      const settings = await updateGuildSettings(interaction.guildId, {
        moderation: {
          logChannelId: logChannel.id,
          nextCaseNumber: current.moderation?.nextCaseNumber ?? 1,
          cases: current.moderation?.cases ?? {},
          nextNoteNumber: current.moderation?.nextNoteNumber ?? 1,
          notes: current.moderation?.notes ?? {},
        },
      });
      await interaction.reply({
        content: `Moderation cases will now be recorded in ${logChannel}.\n\n${settingsSummary(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const welcomeChannel = interaction.options.getChannel("welcome-channel", true);
    const logChannel = interaction.options.getChannel("log-channel", true);
    const newcomerRole = interaction.options.getRole("newcomer-role", true);

    if (newcomerRole.managed || !newcomerRole.editable) {
      await interaction.reply({
        content:
          "Grey Ghost cannot assign that role. Move Grey Ghost's role above it in **Server Settings → Roles**, then try again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = await updateGuildSettings(interaction.guildId, {
      welcomeChannelId: welcomeChannel.id,
      logChannelId: logChannel.id,
      newcomerRoleId: newcomerRole.id,
    });

    await interaction.reply({
      content: `Onboarding is configured.\n\n${settingsSummary(settings)}\n\nNew members will receive ${newcomerRole} automatically, and the welcome message will read: **@user has entered the gates of King's Landing.**`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
