import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { changeRenown, getEconomyPlayer, grantCoins } from "../economy/store.js";
import { getHorseProfile, getHuntStats, recordHunt } from "../stables/store.js";
import { recordFestivalActivity } from "../festivals/store.js";

const quarry = {
  hare: { label: "Hare", difficulty: 0.35, reward: [1, 2] as const },
  deer: { label: "Deer", difficulty: 0.5, reward: [2, 4] as const },
  boar: { label: "Boar", difficulty: 0.65, reward: [3, 6] as const },
} as const;

export const huntCommand: Command = {
  data: new SlashCommandBuilder().setName("hunt").setDescription("Go hunting for coin, Renown, and horse experience.").setDMPermission(false)
    .addSubcommand((sub) => sub.setName("go").setDescription("Set out on a hunt; available every 12 hours.")
      .addStringOption((o) => o.setName("quarry").setDescription("What you are hunting.").setRequired(true).addChoices(
        { name: "Hare — easier", value: "hare" }, { name: "Deer — balanced", value: "deer" }, { name: "Boar — difficult", value: "boar" },
      )))
    .addSubcommand((sub) => sub.setName("stats").setDescription("View your hunting record.")),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const player = await getEconomyPlayer(interaction.guildId, interaction.user.id);
    if (!player) { await interaction.reply({ content: "Create your Realm character first with `/character create`.", flags: MessageFlags.Ephemeral }); return; }
    if (interaction.options.getSubcommand() === "stats") {
      const stats = await getHuntStats(interaction.guildId, interaction.user.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x4f6b3a).setTitle(`${player.character.name} · Hunting Record`).addFields({ name: "Hunts", value: String(stats.completed), inline: true }, { name: "Successful", value: String(stats.successes), inline: true }, { name: "Success Rate", value: stats.completed ? `${Math.round(stats.successes / stats.completed * 100)}%` : "—", inline: true })], flags: MessageFlags.Ephemeral });
      return;
    }
    const key = interaction.options.getString("quarry", true) as keyof typeof quarry;
    const target = quarry[key];
    const mounted = player.equippedMountId ? await getHorseProfile(interaction.guildId, interaction.user.id, player.equippedMountId) : undefined;
    const characterSkill = player.character.damage + player.character.resistance + player.character.health;
    const horseBonus = mounted ? (mounted.stamina + mounted.agility + mounted.bond) / 300 * 0.18 : 0;
    const skillBonus = Math.min(0.2, characterSkill / 100);
    const chance = Math.min(0.9, Math.max(0.15, 1 - target.difficulty + skillBonus + horseBonus));
    const success = Math.random() < chance;
    try {
      await recordHunt(interaction.guildId, interaction.user.id, success, player.equippedMountId);
    } catch (error) {
      const readyAt = (error as Error & { readyAt?: number }).readyAt;
      if ((error as Error).message === "HUNT_COOLDOWN" && readyAt) { await interaction.reply({ content: `You have already hunted recently. You may hunt again <t:${Math.floor(readyAt / 1000)}:R>.`, flags: MessageFlags.Ephemeral }); return; }
      throw error;
    }
    await recordFestivalActivity(interaction.guildId, interaction.user.id, "hunt").catch(() => undefined);
    if (!success) {
      await interaction.reply(`🏹 **The ${target.label.toLowerCase()} hunt came up empty.** ${mounted ? `${mounted.name} still gained a little field experience.` : "The trail went cold before dusk."}`);
      return;
    }
    const coins = target.reward[0] + Math.floor(Math.random() * (target.reward[1] - target.reward[0] + 1));
    await grantCoins(interaction.guildId, interaction.user.id, coins, "Grey Ghost", `${target.label} hunt`);
    const renownGain = key === "boar" ? 2 : 1;
    await changeRenown(interaction.guildId, interaction.user.id, renownGain);
    await interaction.reply(`🏹 **Successful ${target.label} Hunt**\nYou return with your quarry and earn **${coins} coins** and **${renownGain} Renown**.${mounted ? ` **${mounted.name}** also gains hunting experience.` : ""}`);
  },
};
