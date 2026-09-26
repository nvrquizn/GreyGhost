import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { formatItemBonuses, itemsByCategory, type ShopCategory } from "../economy/catalogue.js";

export const shopCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Browse mounts, armour, and supplies for sale.")
    .setDMPermission(false)
    .addStringOption((option) => option.setName("category").setDescription("Limit the shop to one category.")
      .addChoices({ name: "Mounts", value: "mount" }, { name: "Armour", value: "armour" }, { name: "Supplies", value: "supply" })),
  async execute(interaction) {
    const category = interaction.options.getString("category") as ShopCategory | null;
    const rows = itemsByCategory(category ?? undefined).map((item) => `**Tier ${item.tier} · ${item.name}** — ${item.price} coin${item.price === 1 ? "" : "s"}\n${item.description}\n*${formatItemBonuses(item)}*`);
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xb8c2cc).setTitle(category === "mount" ? "The Stable" : category === "armour" ? "The Armoury" : category === "supply" ? "The Healer’s Satchel" : "Realm Shop").setDescription(rows.join("\n\n")).setFooter({ text: "Use /buy to purchase an item." })] });
  },
};
