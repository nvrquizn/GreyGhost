import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type Role } from "discord.js";
import type { Command } from "../types/command.js";
import {
  awardAchievement,
  addHouseChronicleEntry,
  cancelHouseQuest,
  changeHousePoints,
  createHouseQuest,
  getGuildSettings,
  getHouseQuest,
  getHouseQuests,
  progressHouseQuest,
  type HouseQuest,
} from "../services/guild-settings.js";
import { parseReminderDuration } from "./remindme.js";
import { refreshStatsDashboard } from "../stats/dashboard.js";

const categoryLabels = {
  lore: "Lore & Trivia",
  creative: "Creative Work",
  service: "Service to the Realm",
  recruitment: "Recruitment",
  jousting: "Jousting",
} as const;

function questLine(quest: HouseQuest): string {
  const deadline = quest.deadlineAt ? ` · <t:${Math.floor(quest.deadlineAt / 1000)}:R>` : "";
  return `**#${quest.id} · ${quest.title}** · <@&${quest.houseRoleId}>\n${categoryLabels[quest.category]} · **${quest.progress}/${quest.target}** · ${quest.status}${deadline}\nReward: **${quest.rewardPoints}** House Points`;
}

export const houseQuestCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("housequest")
    .setDescription("Create and track deliberate quests for the Great Houses.")
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand.setName("list").setDescription("View current or recent House quests.")
      .addRoleOption((option) => option.setName("house").setDescription("Optionally filter by House.")))
    .addSubcommand((subcommand) => subcommand.setName("create").setDescription("Create a House quest.")
      .addStringOption((option) => option.setName("title").setDescription("The quest title.").setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName("description").setDescription("The concrete objective.").setMaxLength(1500).setRequired(true))
      .addRoleOption((option) => option.setName("house").setDescription("The assigned House.").setRequired(true))
      .addStringOption((option) => option.setName("category").setDescription("The quest category.").setRequired(true).addChoices(
        { name: "Lore & Trivia", value: "lore" }, { name: "Creative Work", value: "creative" },
        { name: "Service to the Realm", value: "service" }, { name: "Recruitment", value: "recruitment" },
        { name: "Jousting", value: "jousting" },
      ))
      .addIntegerOption((option) => option.setName("target").setDescription("How many objective units are required.").setMinValue(1).setMaxValue(10000).setRequired(true))
      .addIntegerOption((option) => option.setName("reward").setDescription("House Points awarded on completion.").setMinValue(0).setMaxValue(1000).setRequired(true))
      .addStringOption((option) => option.setName("deadline").setDescription("Optional time limit, such as 7d or 4w.").setMaxLength(8)))
    .addSubcommand((subcommand) => subcommand.setName("progress").setDescription("Record verified progress toward a quest.")
      .addIntegerOption((option) => option.setName("quest-id").setDescription("The quest number.").setMinValue(1).setRequired(true))
      .addIntegerOption((option) => option.setName("amount").setDescription("Progress units to add.").setMinValue(1).setMaxValue(10000).setRequired(true))
      .addUserOption((option) => option.setName("member").setDescription("Optional member credited for this progress.")))
    .addSubcommand((subcommand) => subcommand.setName("cancel").setDescription("Cancel an active House quest.")
      .addIntegerOption((option) => option.setName("quest-id").setDescription("The quest number.").setMinValue(1).setRequired(true))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "list") {
      const role = interaction.options.getRole("house");
      const quests = (await getHouseQuests(interaction.guildId)).filter((quest) => !role || quest.houseRoleId === role.id).slice(0, 10);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9da8b5).setTitle(role ? `${role.name} · House Quests` : "House Quests").setDescription(
        quests.length ? quests.map(questLine).join("\n\n").slice(0, 4096) : "No matching House quests have been recorded.",
      )] });
      return;
    }
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "You need **Manage Server** to create or update House quests.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === "create") {
      const settings = await getGuildSettings(interaction.guildId);
      const role = interaction.options.getRole("house", true) as Role;
      const houses = new Set(settings.selfRolePanels?.houses?.roles.map((entry) => entry.roleId) ?? []);
      if (!houses.has(role.id)) {
        await interaction.reply({ content: `${role} is not configured in the House Allegiance panel.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const deadlineRaw = interaction.options.getString("deadline");
      const deadline = deadlineRaw ? parseReminderDuration(deadlineRaw) : undefined;
      if (deadlineRaw && !deadline) {
        await interaction.reply({ content: "Use a deadline such as `7d` or `4w` (maximum 365 days).", flags: MessageFlags.Ephemeral });
        return;
      }
      const quest = await createHouseQuest(interaction.guildId, {
        title: interaction.options.getString("title", true),
        description: interaction.options.getString("description", true),
        category: interaction.options.getString("category", true) as keyof typeof categoryLabels,
        houseRoleId: role.id,
        target: interaction.options.getInteger("target", true),
        rewardPoints: interaction.options.getInteger("reward", true),
        deadlineAt: deadline ? Date.now() + deadline : undefined,
        createdBy: interaction.user.id,
      });
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x87ceeb).setTitle(`House Quest #${quest.id} · ${quest.title}`).setDescription(quest.description).addFields(
        { name: "House", value: `${role}`, inline: true }, { name: "Category", value: categoryLabels[quest.category], inline: true },
        { name: "Target", value: String(quest.target), inline: true }, { name: "Reward", value: `${quest.rewardPoints} House Points`, inline: true },
      )] });
      return;
    }
    const questId = interaction.options.getInteger("quest-id", true);
    if (subcommand === "cancel") {
      const quest = await cancelHouseQuest(interaction.guildId, questId);
      await interaction.reply({ content: quest ? `House quest **#${quest.id} · ${quest.title}** was cancelled.` : "That quest is not active or does not exist.", flags: MessageFlags.Ephemeral });
      return;
    }
    const credited = interaction.options.getUser("member");
    const result = await progressHouseQuest(interaction.guildId, questId, interaction.options.getInteger("amount", true));
    if (!result) {
      await interaction.reply({ content: "That quest is not active or does not exist.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (credited) await awardAchievement(interaction.guildId, credited.id, "quest-contributor", interaction.user.id);
    if (result.completedNow && result.quest.rewardPoints > 0) {
      await changeHousePoints(interaction.guildId, {
        houseRoleId: result.quest.houseRoleId,
        delta: result.quest.rewardPoints,
        reason: `Completed House quest #${result.quest.id}: ${result.quest.title}`,
        memberId: credited?.id,
        staffId: interaction.user.id,
      });
      await addHouseChronicleEntry(interaction.guildId, {
        houseRoleId: result.quest.houseRoleId, type: "quest_completed", title: `${result.quest.title} · Quest Completed`,
        description: `<@&${result.quest.houseRoleId}> completed House quest **#${result.quest.id}** and earned **${result.quest.rewardPoints} House Points**.`,
        occurredAt: result.quest.completedAt ?? Date.now(), relatedUserIds: credited ? [credited.id] : [], createdBy: interaction.user.id, sourceKey: `house-quest:${result.quest.id}:completed`,
      });
      void refreshStatsDashboard(interaction.guild).catch(() => undefined);
    }
    await interaction.reply({ content: result.completedNow
      ? `✅ House quest **#${result.quest.id} · ${result.quest.title}** is complete. <@&${result.quest.houseRoleId}> earned **${result.quest.rewardPoints}** House Points.`
      : `House quest **#${result.quest.id}** advanced to **${result.quest.progress}/${result.quest.target}**.${credited ? ` Progress credited to ${credited}.` : ""}` });
  },
};
