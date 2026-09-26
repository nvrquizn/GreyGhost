import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { shopItemMap } from "../economy/catalogue.js";
import { getEconomyPlayer } from "../economy/store.js";

export const inventoryCommand: Command = {
  data: new SlashCommandBuilder().setName("inventory").setDescription("View your owned equipment.").setDMPermission(false),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const player = await getEconomyPlayer(interaction.guildId, interaction.user.id);
    if (!player) { await interaction.reply({ content: "Create your Realm character first with `/character create`.", flags: MessageFlags.Ephemeral }); return; }
    const items = player.inventory.map((id) => shopItemMap.get(id)).filter(Boolean);
    const mounts = items.filter((item) => item!.category === "mount").map((item) => `${item!.id === player.equippedMountId ? "⚔️ " : ""}${item!.name}`);
    const armour = items.filter((item) => item!.category === "armour").map((item) => `${item!.id === player.equippedArmourId ? "⚔️ " : ""}${item!.name}`);
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xb8c2cc).setTitle(`${player.character.name} · Inventory`).addFields({ name: "Mounts", value: mounts.join("\n") || "None" }, { name: "Armour", value: armour.join("\n") || "None" }).setFooter({ text: "⚔️ = equipped" })], flags: MessageFlags.Ephemeral });
  },
};
