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
  ensureServerCreationChronicle,
  getGuildSettings,
  updateGuildSettings,
  type GuildSettings,
} from "../services/guild-settings.js";
import { diagnoseGuildSetup } from "../services/setup-diagnostics.js";
import { publishChronicleEntry } from "../chronicles/runtime.js";

function diagnosticList(items: string[], empty: string): string {
  if (!items.length) return empty;
  const visible = items.slice(0, 10).map((item) => `• ${item}`);
  if (items.length > visible.length) visible.push(`• …and ${items.length - visible.length} more.`);
  return visible.join("\n").slice(0, 1024);
}

function settingsSummary(settings: GuildSettings): string {
  return [
    `**Welcome channel:** ${settings.welcomeChannelId ? `<#${settings.welcomeChannelId}>` : "Not configured"}`,
    `**Welcome GIF:** ${settings.welcomeGifUrl ? "Configured" : "Not configured"}`,
    `**Join/leave log:** ${settings.logChannelId ? `<#${settings.logChannelId}>` : "Not configured"}`,
    `**Newcomer role:** ${settings.newcomerRoleId ? `<@&${settings.newcomerRoleId}>` : "Not configured"}`,
    `**Governance:** ${settings.governance ? `petitions <#${settings.governance.petitionChannelId}> · council <#${settings.governance.councilChannelId}> · voters <@&${settings.governance.councilRoleId}> · applications <#${settings.governance.staffApplicationChannelId}>` : "Not configured"}`,
    `**Collection announcements:** ${settings.collectionAnnouncementChannelId ? `<#${settings.collectionAnnouncementChannelId}>` : "Not configured"}`,
    `**Server logs:** ${settings.serverLogChannelId ? `<#${settings.serverLogChannelId}>` : "Not configured"}`,
    `**Reaction logs:** ${settings.reactionLogChannelId ? `<#${settings.reactionLogChannelId}>` : "Not configured"}`,
    `**Chronicles:** ${settings.chronicleChannelId ? `<#${settings.chronicleChannelId}>` : "Not configured"}`,
    `**Moderator role:** ${settings.moderatorRoleId ? `<@&${settings.moderatorRoleId}>` : "Not configured"}`,
    `**Dragon grant channel:** ${settings.dragonGrantChannelId ? `<#${settings.dragonGrantChannelId}>` : "Not configured (Grey Ghost will DM recipients)"}`,
    `**Champions role:** ${settings.championsRoleId ? `<@&${settings.championsRoleId}>` : "Not configured"}`,
    `**Tourney Summons:** ${settings.tourneySummonsRoleId ? `<@&${settings.tourneySummonsRoleId}>` : "Not configured"}`,
    `**Event announcement channel:** ${settings.eventAnnouncementChannelId ? `<#${settings.eventAnnouncementChannelId}>` : "Not configured"}`,
    `**Event chat:** ${settings.eventChatChannelId ?? settings.eventChannelId ? `<#${settings.eventChatChannelId ?? settings.eventChannelId}>` : "Not configured"}`,
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
        .setName("welcome-gif")
        .setDescription("Set the GIF or animated image shown with public welcome messages.")
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("A Discord attachment/CDN or Tenor URL.")
            .setRequired(true)
            .setMaxLength(1500),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("welcome-gif-clear")
        .setDescription("Remove the configured welcome GIF."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("governance")
        .setDescription("Configure petitions, council proposals, and staff applications.")
        .addChannelOption((option) =>
          option
            .setName("petitions-channel")
            .setDescription("The public channel for member petitions.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addChannelOption((option) => option
          .setName("council-channel")
          .setDescription("The private channel for council proposals.")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true))
        .addRoleOption((option) => option
          .setName("council-role")
          .setDescription("The staff/council role permitted to vote.")
          .setRequired(true))
        .addChannelOption((option) => option
          .setName("applications-channel")
          .setDescription("The private channel that stores staff applications.")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)),
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
      subcommand
        .setName("server-logs")
        .setDescription("Choose where server audit activity is recorded.")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The private channel for Grey Ghost's server audit logs.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reaction-logs")
        .setDescription("Choose a separate channel for added and removed reactions.")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The private channel for reaction activity.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) => subcommand
      .setName("chronicles")
      .setDescription("Choose where permanent Realm history is published.")
      .addChannelOption((option) => option
        .setName("channel")
        .setDescription("The public or read-only Chronicles channel.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)))
    .addSubcommand((subcommand) =>
      subcommand.setName("check").setDescription("Check Grey Ghost's setup and permissions."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("view").setDescription("View the current Grey Ghost settings."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("moderator-role")
        .setDescription("Choose the role required for Grey Ghost moderation commands and dragon creation.")
        .addRoleOption((option) => option
          .setName("role")
          .setDescription("The moderator role, such as Dragonrider.")
          .setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("dragon-grants")
        .setDescription("Choose where special dragon grants are announced.")
        .addChannelOption((option) => option
          .setName("channel")
          .setDescription("Channel where specially granted riders are pinged.")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("champions-role")
        .setDescription("Choose the role awarded to top-three competitive event finishers.")
        .addRoleOption((option) => option.setName("role").setDescription("The Champions role.").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("tourney-summons")
        .setDescription("Choose the ping role used when competitions are published.")
        .addRoleOption((option) => option.setName("role").setDescription("The Tourney Summons role.").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("event-channel")
        .setDescription("Choose where published competition announcements are posted.")
        .addChannelOption((option) => option.setName("channel").setDescription("The event announcement channel.").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("event-chat")
        .setDescription("Choose where summoned members go to enter published competitions.")
        .addChannelOption((option) => option.setName("channel").setDescription("The event chat where members use entry commands.").addChannelTypes(ChannelType.GuildText).setRequired(true)),
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
              { name: "Welcome GIF", value: "welcomeGifUrl" },
              { name: "Join/leave log", value: "logChannelId" },
              { name: "Newcomer role", value: "newcomerRoleId" },
              {
                name: "Collection announcements",
                value: "collectionAnnouncementChannelId",
              },
              { name: "Modmail", value: "modmail" },
              { name: "Moderation records", value: "moderation" },
              { name: "Server logs", value: "serverLogChannelId" },
              { name: "Reaction logs", value: "reactionLogChannelId" },
              { name: "Chronicles channel", value: "chronicleChannelId" },
              { name: "Moderator role", value: "moderatorRoleId" },
              { name: "Dragon grant channel", value: "dragonGrantChannelId" },
              { name: "Champions role", value: "championsRoleId" },
              { name: "Tourney Summons role", value: "tourneySummonsRoleId" },
              { name: "Event announcement channel", value: "eventAnnouncementChannelId" },
              { name: "Event chat", value: "eventChatChannelId" },
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

    if (subcommand === "welcome-gif") {
      const rawUrl = interaction.options.getString("url", true).trim();
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        await interaction.reply({
          content: "That does not look like a valid URL. Paste the Discord attachment/CDN or Tenor link again.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        await interaction.reply({
          content: "The welcome GIF must use an `http://` or `https://` URL.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const settings = await updateGuildSettings(interaction.guildId, { welcomeGifUrl: rawUrl });
      await interaction.reply({
        content: `Welcome GIF configured. Grey Ghost will include it beneath the public welcome message.\n\n${settingsSummary(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "welcome-gif-clear") {
      const settings = await clearGuildSetting(interaction.guildId, "welcomeGifUrl");
      await interaction.reply({
        content: `Welcome GIF cleared. Public welcome messages will return to text only.\n\n${settingsSummary(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

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

    if (subcommand === "moderator-role") {
      const role = interaction.options.getRole("role", true);
      if (role.id === interaction.guild.roles.everyone.id) {
        await interaction.reply({ content: "Choose a staff role—not @everyone—as the moderator role.", flags: MessageFlags.Ephemeral });
        return;
      }
      const settings = await updateGuildSettings(interaction.guildId, { moderatorRoleId: role.id });
      await interaction.reply({
        content: `${role} is now required for Grey Ghost moderation commands and dragon creation. Members may have only one dragon each.

${settingsSummary(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "dragon-grants") {
      const channel = interaction.options.getChannel("channel", true);
      const settings = await updateGuildSettings(interaction.guildId, { dragonGrantChannelId: channel.id });
      await interaction.reply({
        content: `Special dragon grants will be announced in ${channel}. If Grey Ghost cannot post there, the recipient will be DM'd instead.\n\n${settingsSummary(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }


    if (subcommand === "champions-role") {
      const role = interaction.options.getRole("role", true);
      if (role.id === interaction.guild.roles.everyone.id) {
        await interaction.reply({ content: "Choose a dedicated Champions role—not @everyone.", flags: MessageFlags.Ephemeral });
        return;
      }
      const settings = await updateGuildSettings(interaction.guildId, { championsRoleId: role.id });
      await interaction.reply({ content: `${role} will now be awarded to top-three finishers in supported competitive events.\n\n${settingsSummary(settings)}`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "tourney-summons") {
      const role = interaction.options.getRole("role", true);
      if (role.id === interaction.guild.roles.everyone.id) {
        await interaction.reply({ content: "Choose a dedicated Tourney Summons role—not @everyone.", flags: MessageFlags.Ephemeral });
        return;
      }
      const settings = await updateGuildSettings(interaction.guildId, { tourneySummonsRoleId: role.id });
      await interaction.reply({ content: `${role} will be pinged outside event embeds when jousts, melees, races, and festivals are published.\n\n${settingsSummary(settings)}`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "event-channel") {
      const channel = interaction.options.getChannel("channel", true);
      const settings = await updateGuildSettings(interaction.guildId, { eventAnnouncementChannelId: channel.id });
      await interaction.reply({ content: `${channel} is now the event announcement channel. Published jousts, melees, races, and festivals will be posted there.\n\n${settingsSummary(settings)}`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "event-chat") {
      const channel = interaction.options.getChannel("channel", true);
      const settings = await updateGuildSettings(interaction.guildId, { eventChatChannelId: channel.id });
      await interaction.reply({ content: `${channel} is now the event chat. Tourney Summons announcements will direct members there to use the event entry command.\n\n${settingsSummary(settings)}`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "governance") {
      const petitions = interaction.options.getChannel("petitions-channel", true);
      const council = interaction.options.getChannel("council-channel", true);
      const councilRole = interaction.options.getRole("council-role", true);
      const applications = interaction.options.getChannel("applications-channel", true);
      if (councilRole.id === interaction.guild.roles.everyone.id) {
        await interaction.reply({ content: "Choose a private staff or council role—not @everyone—for voting.", flags: MessageFlags.Ephemeral });
        return;
      }
      const current = await getGuildSettings(interaction.guildId);
      const settings = await updateGuildSettings(interaction.guildId, {
        suggestionChannelId: petitions.id,
        governance: {
          petitionChannelId: petitions.id,
          councilChannelId: council.id,
          councilRoleId: councilRole.id,
          staffApplicationChannelId: applications.id,
          nextProposalNumber: current.governance?.nextProposalNumber ?? 1,
          proposals: current.governance?.proposals ?? {},
          nextApplicationNumber: current.governance?.nextApplicationNumber ?? 1,
          applications: current.governance?.applications ?? {},
        },
      });

      await interaction.reply({
        content: `Governance is configured: petitions in ${petitions}, private proposals in ${council}, staff applications in ${applications}, and ${councilRole} may vote. Only the server owner can make final accept/deny decisions.\n\n${settingsSummary(settings)}`,
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

    if (subcommand === "server-logs") {
      const channel = interaction.options.getChannel("channel", true);
      const settings = await updateGuildSettings(interaction.guildId, {
        serverLogChannelId: channel.id,
      });
      await interaction.reply({
        content: `Server activity—including member, invite, message, channel, permission, thread, role, and ghost-ping events—will now be recorded in ${channel}.\n\n${settingsSummary(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "reaction-logs") {
      const channel = interaction.options.getChannel("channel", true);
      const settings = await updateGuildSettings(interaction.guildId, {
        reactionLogChannelId: channel.id,
      });
      await interaction.reply({
        content: `Added and removed reactions will now be recorded separately in ${channel}.\n\n${settingsSummary(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "chronicles") {
      const channel = interaction.options.getChannel("channel", true);
      const settings = await updateGuildSettings(interaction.guildId, { chronicleChannelId: channel.id });
      const founding = await ensureServerCreationChronicle(
        interaction.guildId,
        interaction.guild.name,
        interaction.guild.createdTimestamp,
      );
      await publishChronicleEntry(interaction.guild, founding);
      await interaction.reply({
        content: `Realm history—including server founding, House-season winners, and tourney champions—will be published in ${channel}. The founding record has been posted.\n\n${settingsSummary(settings)}`,
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
