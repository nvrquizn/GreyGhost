import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { shopItems, shopItemMap } from "../economy/catalogue.js";
import { buyItem } from "../economy/store.js";

export const buyCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Purchase a mount or piece of armour.")
    .setDMPermission(false)
    .addStringOption((option) => option.setName("item").setDescription("Item to purchase.").setRequired(true)
      .addChoices(...shopItems.map((item) => ({ name: `${item.name} — ${item.price} coin${item.price === 1 ? "" : "s"}`, value: item.id })))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const itemId = interaction.options.getString("item", true);
    const item = shopItemMap.get(itemId)!;
    try {
      const { player } = await buyItem(interaction.guildId, interaction.user.id, itemId);
      await interaction.reply({ content: `Purchased **${item.name}** for **${item.price} coin${item.price === 1 ? "" : "s"}**. You have **${player.coins}** remaining.` });
    } catch (error) {
      const code = (error as Error).message;
      const content = code === "CHARACTER_REQUIRED" ? "Create your Realm character first with `/character create`." : code === "ITEM_OWNED" ? `You already own **${item.name}**.` : code === "INSUFFICIENT_COINS" ? `You do not have enough coin for **${item.name}**.` : undefined;
      if (content) { await interaction.reply({ content, flags: MessageFlags.Ephemeral }); return; }
      throw error;
    }
  },
};
