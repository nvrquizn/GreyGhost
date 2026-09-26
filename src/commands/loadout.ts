import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { shopItems, shopItemMap } from "../economy/catalogue.js";
import { equipItem, getEconomyPlayer } from "../economy/store.js";

const mounts = shopItems.filter((item) => item.category === "mount");
const armour = shopItems.filter((item) => item.category === "armour");

export const loadoutCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("loadout")
    .setDescription("View or change your equipped mount and armour.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("view").setDescription("View your equipped gear."))
    .addSubcommand((sub) => sub.setName("mount").setDescription("Equip an owned mount.")
      .addStringOption((option) => option.setName("item").setDescription("Mount to equip.").setRequired(true).addChoices(...mounts.map((item) => ({ name: item.name, value: item.id })))))
    .addSubcommand((sub) => sub.setName("armour").setDescription("Equip owned armour.")
      .addStringOption((option) => option.setName("item").setDescription("Armour to equip.").setRequired(true).addChoices(...armour.map((item) => ({ name: item.name, value: item.id }))))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "view") {
      const player = await getEconomyPlayer(interaction.guildId, interaction.user.id);
      if (!player) { await interaction.reply({ content: "Create your Realm character first with `/character create`.", flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xb8c2cc).setTitle(`${player.character.name} · Loadout`).addFields({ name: "Mount", value: player.equippedMountId ? shopItemMap.get(player.equippedMountId)?.name ?? "Unknown" : "None", inline: true }, { name: "Armour", value: player.equippedArmourId ? shopItemMap.get(player.equippedArmourId)?.name ?? "Unknown" : "None", inline: true })], flags: MessageFlags.Ephemeral });
      return;
    }
    const itemId = interaction.options.getString("item", true);
    const item = shopItemMap.get(itemId)!;
    try {
      await equipItem(interaction.guildId, interaction.user.id, itemId);
      await interaction.reply({ content: `Equipped **${item.name}**.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      const code = (error as Error).message;
      if (code === "CHARACTER_REQUIRED") { await interaction.reply({ content: "Create your Realm character first with `/character create`.", flags: MessageFlags.Ephemeral }); return; }
      if (code === "ITEM_NOT_OWNED") { await interaction.reply({ content: `You do not own **${item.name}**. Purchase it with \`/buy\`.`, flags: MessageFlags.Ephemeral }); return; }
      throw error;
    }
  },
};
