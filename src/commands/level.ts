import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from "discord.js";
import type { Command } from "../types/command.js";
import {
  addXp,
  getLevelGuild,
  getLevelMember,
  LEVEL_THRESHOLDS,
  levelFromXp,
  levelLeaderboard,
  progressForXp,
  resetXp,
  setLevelRole,
  setRoleExcluded,
  takeXp,
  type LevelThreshold,
} from "../levels/store.js";
import { announceLevelUp, syncLevelRoles } from "../levels/runtime.js";

const thresholdChoices = LEVEL_THRESHOLDS.map((value) => ({ name: `Level ${value}+`, value }));

function levelEmbed(userMention: string, displayName: string, xp: number): EmbedBuilder {
  const progress = progressForXp(xp);
  const percent = Math.min(100, Math.floor((progress.current / progress.needed) * 100));
  return new EmbedBuilder()
    .setColor(0xc9a96e)
    .setTitle(`${displayName} · Level ${progress.level}`)
    .setDescription(`${userMention}\n\n**${xp.toLocaleString()} XP**\n${progress.current.toLocaleString()} / ${progress.needed.toLocaleString()} XP toward Level ${progress.level + 1} · **${percent}%**`);
}

async function requireManager(interaction: Parameters<Command["execute"]>[0]): Promise<boolean> {
  if (!interaction.inCachedGuild()) return false;
  if (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  await interaction.reply({ content: "Only server managers may administer levels.", flags: MessageFlags.Ephemeral });
  return false;
}

async function syncTarget(interaction: Parameters<Command["execute"]>[0], userId: string, level: number): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const member = await interaction.guild.members.fetch(userId).catch(() => undefined);
  if (member) await syncLevelRoles(member, level);
}

export const levelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("View levels or administer message XP.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("view").setDescription("View a member's level and XP.")
      .addUserOption((option) => option.setName("user").setDescription("Member to view; defaults to you.")))
    .addSubcommand((sub) => sub.setName("leaderboard").setDescription("View the server's highest levels."))
    .addSubcommand((sub) => sub.setName("give").setDescription("Give XP to a member.")
      .addUserOption((option) => option.setName("user").setDescription("Member to receive XP.").setRequired(true))
      .addIntegerOption((option) => option.setName("xp").setDescription("XP to give.").setMinValue(1).setMaxValue(1_000_000).setRequired(true)))
    .addSubcommand((sub) => sub.setName("take").setDescription("Take XP from a member.")
      .addUserOption((option) => option.setName("user").setDescription("Member to remove XP from.").setRequired(true))
      .addIntegerOption((option) => option.setName("xp").setDescription("XP to remove.").setMinValue(1).setMaxValue(1_000_000).setRequired(true)))
    .addSubcommand((sub) => sub.setName("reset").setDescription("Reset a member to 0 XP.")
      .addUserOption((option) => option.setName("user").setDescription("Member to reset.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("exclude-role").setDescription("Stop members with a role from earning message XP.")
      .addRoleOption((option) => option.setName("role").setDescription("Role to exclude from XP.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("include-role").setDescription("Allow an excluded role to earn message XP again.")
      .addRoleOption((option) => option.setName("role").setDescription("Role to allow again.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("excluded").setDescription("View roles excluded from earning XP."))
    .addSubcommand((sub) => sub.setName("settings").setDescription("View level roles and XP exclusions."))
    .addSubcommand((sub) => sub.setName("role-set").setDescription("Configure a level reward role.")
      .addIntegerOption((option) => option.setName("level").setDescription("Level threshold.").setRequired(true).addChoices(...thresholdChoices))
      .addRoleOption((option) => option.setName("role").setDescription("Role awarded at this threshold.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("role-clear").setDescription("Clear a configured level reward role and use the matching role name instead.")
      .addIntegerOption((option) => option.setName("level").setDescription("Level threshold.").setRequired(true).addChoices(...thresholdChoices)))
    .addSubcommand((sub) => sub.setName("sync").setDescription("Synchronize a member's level roles with their XP.")
      .addUserOption((option) => option.setName("user").setDescription("Member to synchronize.").setRequired(true))),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "view") {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => undefined);
      const record = await getLevelMember(interaction.guildId, user.id);
      await interaction.reply({ embeds: [levelEmbed(`${user}`, member?.displayName ?? user.username, record.xp)] });
      return;
    }

    if (sub === "leaderboard") {
      const rows = await levelLeaderboard(interaction.guildId, 10);
      const embed = new EmbedBuilder().setColor(0xd4af37).setTitle("Realm Levels").setDescription(
        rows.length
          ? rows.map((row, index) => `**${index + 1}.** <@${row.userId}> · **Level ${row.level}** · ${row.xp.toLocaleString()} XP`).join("\n")
          : "No one has earned XP yet.",
      );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (["give", "take", "reset", "exclude-role", "include-role", "role-set", "role-clear", "sync"].includes(sub)) {
      if (!(await requireManager(interaction))) return;
    }

    if (sub === "give") {
      const user = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("xp", true);
      const result = await addXp(interaction.guildId, user.id, amount);
      const beforeLevel = levelFromXp(result.before.xp);
      const level = levelFromXp(result.after.xp);
      await syncTarget(interaction, user.id, level);
      const member = await interaction.guild.members.fetch(user.id).catch(() => undefined);
      if (member && level > beforeLevel) await announceLevelUp(member, level);
      await interaction.reply({ content: `Gave **${amount.toLocaleString()} XP** to ${user}. They now have **${result.after.xp.toLocaleString()} XP** (Level ${level}).`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "take") {
      const user = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("xp", true);
      const result = await takeXp(interaction.guildId, user.id, amount);
      const level = levelFromXp(result.xp);
      await syncTarget(interaction, user.id, level);
      await interaction.reply({ content: `Removed up to **${amount.toLocaleString()} XP** from ${user}. They now have **${result.xp.toLocaleString()} XP** (Level ${level}).`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "reset") {
      const user = interaction.options.getUser("user", true);
      await resetXp(interaction.guildId, user.id);
      await syncTarget(interaction, user.id, 0);
      await interaction.reply({ content: `${user}'s XP has been reset to **0**.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "exclude-role" || sub === "include-role") {
      const role = interaction.options.getRole("role", true);
      const excluded = sub === "exclude-role";
      await setRoleExcluded(interaction.guildId, role.id, excluded);
      await interaction.reply({ content: excluded ? `${role} is now excluded from earning message XP.` : `${role} may earn message XP again.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "settings") {
      const config = await getLevelGuild(interaction.guildId);
      const levelRoles = LEVEL_THRESHOLDS.map((threshold) => {
        const configuredId = config.roleIds[String(threshold)];
        const role = configuredId
          ? interaction.guild.roles.cache.get(configuredId)
          : interaction.guild.roles.cache.find((entry) => entry.name === `Level ${threshold}+`);
        return `**Level ${threshold}+:** ${role ?? "Not found"}${configuredId ? " · configured" : " · automatic by name"}`;
      });
      const excluded = config.excludedRoleIds.map((id) => interaction.guild.roles.cache.get(id)).filter(Boolean);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xb8c2cc)
          .setTitle("Level Settings")
          .setDescription(`${levelRoles.join("\n")}\n\n**XP-excluded roles:** ${excluded.length ? excluded.join(", ") : "None"}`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "excluded") {
      const config = await getLevelGuild(interaction.guildId);
      const roles = config.excludedRoleIds.map((id) => interaction.guild.roles.cache.get(id)).filter((role): role is NonNullable<typeof role> => Boolean(role));
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xb8c2cc).setTitle("XP-Excluded Roles").setDescription(roles.length ? roles.map((role) => `${role}`).join("\n") : "No roles are excluded from earning XP.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "role-set") {
      const threshold = interaction.options.getInteger("level", true) as LevelThreshold;
      const role = interaction.options.getRole("role", true);
      await setLevelRole(interaction.guildId, threshold, role.id);
      await interaction.reply({ content: `${role} will now be used for **Level ${threshold}+**.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "role-clear") {
      const threshold = interaction.options.getInteger("level", true) as LevelThreshold;
      await setLevelRole(interaction.guildId, threshold);
      await interaction.reply({ content: `Cleared the custom Level ${threshold}+ role. Grey Ghost will look for a role named **Level ${threshold}+** instead.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "sync") {
      const user = interaction.options.getUser("user", true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => undefined) as GuildMember | undefined;
      if (!member) {
        await interaction.reply({ content: "That member is not currently in the server.", flags: MessageFlags.Ephemeral });
        return;
      }
      const record = await getLevelMember(interaction.guildId, user.id);
      const level = levelFromXp(record.xp);
      await syncLevelRoles(member, level);
      await interaction.reply({ content: `Synchronized ${user}'s level roles for **Level ${level}**.`, flags: MessageFlags.Ephemeral });
    }
  },
};
