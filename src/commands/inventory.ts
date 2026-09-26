import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { countInventoryItem, shopItemMap, shopItems } from "../economy/catalogue.js";
import { clearExpiredInjury, getEconomyPlayer } from "../economy/store.js";

export const inventoryCommand: Command = {
  data: new SlashCommandBuilder().setName("inventory").setDescription("View your owned equipment and supplies.").setDMPermission(false),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const player = await clearExpiredInjury(interaction.guildId, interaction.user.id) ?? await getEconomyPlayer(interaction.guildId, interaction.user.id);
    if (!player) { await interaction.reply({ content: "Create your Realm character first with `/character create`.", flags: MessageFlags.Ephemeral }); return; }
    const items = player.inventory.map((id) => shopItemMap.get(id)).filter(Boolean);
    const mounts = items.filter((item) => item!.category === "mount").map((item) => `${item!.id === player.equippedMountId ? "⚔️ " : ""}${item!.name}`);
    const armour = items.filter((item) => item!.category === "armour").map((item) => `${item!.id === player.equippedArmourId ? "⚔️ " : ""}${item!.name}`);
    const supplies = shopItems.filter((item) => item.category === "supply").map((item) => {
      const count = countInventoryItem(player.inventory, item.id);
      return count > 0 ? `${item.name} ×${count}` : undefined;
    }).filter(Boolean);
    const injury = player.injury
      ? `**${player.injury.severity}** from ${player.injury.reason}${player.injury.clearsAt ? `\nClears <t:${Math.floor(player.injury.clearsAt / 1000)}:R> unless treated.` : ""}`
      : "None";
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xb8c2cc).setTitle(`${player.character.name} · Inventory`).addFields(
      { name: "Mounts", value: mounts.join("\n") || "None" },
      { name: "Armour", value: armour.join("\n") || "None" },
      { name: "Supplies", value: supplies.join("\n") || "None" },
      { name: "Injury", value: injury },
    ).setFooter({ text: "⚔️ = equipped" })], flags: MessageFlags.Ephemeral });
  },
};
