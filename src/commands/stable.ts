import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { shopItemMap, shopItems } from "../economy/catalogue.js";
import { getEconomyPlayer } from "../economy/store.js";
import { customizeHorse, getHorseProfile, getHorseProfiles, trainHorse, type HorseStat } from "../stables/store.js";

const mountChoices = shopItems.filter((item) => item.category === "mount").map((item) => ({ name: item.name, value: item.id }));

function horseText(horse: Awaited<ReturnType<typeof getHorseProfile>>): string {
  if (!horse) return "Horse not found.";
  const base = shopItemMap.get(horse.mountId);
  return [
    `**${horse.name}** · ${base?.name ?? horse.mountId} · Tier ${base?.tier ?? "?"}`,
    `Coat: **${horse.coat}** · Sex: **${horse.sex}**`,
    `Temperament: **${horse.temperament}**`,
    `Speed **${horse.speed}** · Stamina **${horse.stamina}** · Agility **${horse.agility}** · Bond **${horse.bond}**`,
    `Races **${horse.races}** · Wins **${horse.wins}** · Hunts **${horse.hunts}**`,
  ].join("\n");
}

export const stableCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("stable")
    .setDescription("View, customize, and train your horses.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("view").setDescription("View your stable."))
    .addSubcommand((sub) => sub.setName("horse").setDescription("View one horse in detail.")
      .addStringOption((option) => option.setName("mount").setDescription("Owned horse type.").setRequired(true).addChoices(...mountChoices)))
    .addSubcommand((sub) => sub.setName("customize").setDescription("Customize one of your horses.")
      .addStringOption((option) => option.setName("mount").setDescription("Owned horse type.").setRequired(true).addChoices(...mountChoices))
      .addStringOption((option) => option.setName("name").setDescription("Horse name.").setMaxLength(40))
      .addStringOption((option) => option.setName("coat").setDescription("Coat colour or pattern.").setMaxLength(60))
      .addStringOption((option) => option.setName("sex").setDescription("Horse sex.").setMaxLength(30))
      .addStringOption((option) => option.setName("temperament").setDescription("Horse temperament.").setMaxLength(80)))
    .addSubcommand((sub) => sub.setName("train").setDescription("Train one horse once per day.")
      .addStringOption((option) => option.setName("mount").setDescription("Owned horse type.").setRequired(true).addChoices(...mountChoices))
      .addStringOption((option) => option.setName("stat").setDescription("Training focus.").setRequired(true).addChoices(
        { name: "Speed", value: "speed" }, { name: "Stamina", value: "stamina" }, { name: "Agility", value: "agility" },
      ))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const player = await getEconomyPlayer(interaction.guildId, interaction.user.id);
    if (!player) { await interaction.reply({ content: "Create your Realm character first with `/character create`.", flags: MessageFlags.Ephemeral }); return; }
    const sub = interaction.options.getSubcommand();
    if (sub === "view") {
      const horses = await getHorseProfiles(interaction.guildId, interaction.user.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xb8c2cc).setTitle(`${player.character.name} · Stable`).setDescription(horses.map((horse) => {
        const item = shopItemMap.get(horse.mountId);
        const equipped = player.equippedMountId === horse.mountId ? "⚔️" : "▫️";
        return `${equipped} **${horse.name}** · ${item?.name ?? horse.mountId} · Bond ${horse.bond} · Races ${horse.races}`;
      }).join("\n") || "Your stable is empty.").setFooter({ text: "Use /stable horse for details, /stable customize to personalize, and /stable train for daily progression." })], flags: MessageFlags.Ephemeral });
      return;
    }
    const mountId = interaction.options.getString("mount", true);
    if (sub === "horse") {
      const horse = await getHorseProfile(interaction.guildId, interaction.user.id, mountId);
      if (!horse) { await interaction.reply({ content: "You do not own that horse.", flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8b6f47).setTitle(`${horse.name} · Stable Record`).setDescription(horseText(horse))], flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === "customize") {
      const changes = {
        name: interaction.options.getString("name") ?? undefined,
        coat: interaction.options.getString("coat") ?? undefined,
        sex: interaction.options.getString("sex") ?? undefined,
        temperament: interaction.options.getString("temperament") ?? undefined,
      };
      if (!Object.values(changes).some((value) => value !== undefined)) { await interaction.reply({ content: "Give Grey Ghost at least one detail to change.", flags: MessageFlags.Ephemeral }); return; }
      try {
        const horse = await customizeHorse(interaction.guildId, interaction.user.id, mountId, changes);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8b6f47).setTitle(`${horse.name} · Updated`).setDescription(horseText(horse))], flags: MessageFlags.Ephemeral });
      } catch { await interaction.reply({ content: "You do not own that horse.", flags: MessageFlags.Ephemeral }); }
      return;
    }
    try {
      const stat = interaction.options.getString("stat", true) as HorseStat;
      const horse = await trainHorse(interaction.guildId, interaction.user.id, mountId, stat);
      await interaction.reply(`🐎 **${horse.name}** trained **${stat}**. ${stat[0]!.toUpperCase()}${stat.slice(1)} is now **${horse[stat]}**, and your bond is **${horse.bond}**.`);
    } catch (error) {
      const code = (error as Error).message;
      await interaction.reply({ content: code === "HORSE_TRAINED_TODAY" ? "That horse has already trained today." : "You do not own that horse.", flags: MessageFlags.Ephemeral });
    }
  },
};
