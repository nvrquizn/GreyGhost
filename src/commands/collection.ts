import {
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SlashCommandBuilder,
  type GuildMember,
} from "discord.js";
import type { Command } from "../types/command.js";
import {
  deleteCollectionSet,
  getCollectionSet,
  getCollectionSets,
} from "../services/guild-settings.js";
import { createPendingCollectionConfiguration } from "../collections/pending-configuration.js";
import { evaluateMemberCollections } from "../collections/evaluator.js";

function canManageRoles(interaction: { memberPermissions: { has(flag: bigint): boolean } | null }) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles) ?? false;
}

export const collectionCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("collection")
    .setDescription("Check collection progress or configure set titles.")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("progress")
        .setDescription("Check collection-title progress.")
        .addUserOption((option) =>
          option.setName("member").setDescription("Optional member to inspect."),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configure")
        .setDescription("Configure an automatic collection title.")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("The set name, such as Blood of the Dragon.")
            .setMaxLength(80)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("title-role")
            .setDescription("The role granted when the set is completed.")
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("required-count")
            .setDescription("How many selected roles are required; omit to require all.")
            .setMinValue(1)
            .setMaxValue(25),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View the configuration for a collection title.")
        .addRoleOption((option) =>
          option
            .setName("title-role")
            .setDescription("The configured title role.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove an automatic collection-title configuration.")
        .addRoleOption((option) =>
          option
            .setName("title-role")
            .setDescription("The configured title role.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("sync")
        .setDescription("Check every member and synchronize their collection titles."),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "progress") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const selectedUser = interaction.options.getUser("member") ?? interaction.user;
      let member = await interaction.guild.members.fetch(selectedUser.id);
      await evaluateMemberCollections(member);
      member = await interaction.guild.members.fetch(selectedUser.id);
      const collectionSets = await getCollectionSets(interaction.guildId);

      if (!collectionSets.length) {
        await interaction.editReply("No collection titles have been configured yet.");
        return;
      }

      const lines = collectionSets.map((set) => {
        const progress = set.requirementRoleIds.filter((roleId) =>
          member.roles.cache.has(roleId),
        ).length;
        const completed = progress >= set.requiredCount;
        return `${completed ? "✅" : "▫️"} **${set.name}** — ${Math.min(progress, set.requiredCount)}/${set.requiredCount}`;
      });

      const completedCount = collectionSets.filter((set) =>
        member.roles.cache.has(set.titleRoleId),
      ).length;
      const embed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setAuthor({
          name: `${selectedUser.globalName ?? selectedUser.username}'s Collection Progress`,
          iconURL: selectedUser.displayAvatarURL(),
        })
        .setDescription(lines.join("\n"))
        .setFooter({ text: `${completedCount} of ${collectionSets.length} titles completed` });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (!canManageRoles(interaction)) {
      await interaction.reply({
        content: "You need **Manage Roles** to use that collection command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "configure") {
      const titleRole = interaction.options.getRole("title-role", true);
      if (titleRole.managed || !titleRole.editable) {
        await interaction.reply({
          content:
            "Grey Ghost cannot assign that title. Move Grey Ghost's role above it, then try again.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const existing = await getCollectionSet(interaction.guildId, titleRole.id);
      const token = createPendingCollectionConfiguration({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        name: interaction.options.getString("name", true),
        titleRoleId: titleRole.id,
        requiredCount: interaction.options.getInteger("required-count") ?? undefined,
      });
      const menu = new RoleSelectMenuBuilder()
        .setCustomId(`collection-config:${token}`)
        .setPlaceholder("Select the admirer or completed-set roles")
        .setMinValues(1)
        .setMaxValues(25);

      if (existing?.requirementRoleIds.length) {
        menu.setDefaultRoles(...existing.requirementRoleIds);
      }

      await interaction.reply({
        content: `Select the roles that count toward ${titleRole}. If you omitted **required-count**, every selected role will be required.`,
        components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menu)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const titleRole = interaction.options.getRole("title-role");

    if (subcommand === "view" && titleRole) {
      const collectionSet = await getCollectionSet(interaction.guildId, titleRole.id);
      if (!collectionSet) {
        await interaction.reply({
          content: `${titleRole} is not configured as a collection title.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        content: `## ${collectionSet.name}\n**Title:** ${titleRole}\n**Requirement:** ${collectionSet.requiredCount} of ${collectionSet.requirementRoleIds.length}\n\n${collectionSet.requirementRoleIds.map((roleId) => `<@&${roleId}>`).join("\n")}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "remove" && titleRole) {
      const removed = await deleteCollectionSet(interaction.guildId, titleRole.id);
      await interaction.reply({
        content: removed
          ? `${titleRole} is no longer managed as a collection title.`
          : `${titleRole} was not configured as a collection title.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const members = await interaction.guild.members.fetch();
    let titlesGranted = 0;
    let titlesRemoved = 0;

    for (const member of members.values()) {
      if (member.user.bot) continue;
      const result = await evaluateMemberCollections(member as GuildMember);
      titlesGranted += result.earned.length;
      titlesRemoved += result.removed.length;
    }

    await interaction.editReply(
      `Collection sync complete. **${titlesGranted}** title roles granted and **${titlesRemoved}** removed.`,
    );
  },
};
