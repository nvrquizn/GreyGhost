import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { shopItemMap } from "../economy/catalogue.js";
import { getEconomyPlayer } from "../economy/store.js";

export const armouryCommand: Command = {
  data: new SlashCommandBuilder().setName("armoury").setDescription("View your owned armour.").setDMPermission(false),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const player = await getEconomyPlayer(interaction.guildId, interaction.user.id);
    if (!player) { await interaction.reply({ content: "Create your Realm character first with `/character create`.", flags: MessageFlags.Ephemeral }); return; }
    const armour = player.inventory.map((id) => shopItemMap.get(id)).filter((item) => item?.category === "armour");
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xb8c2cc).setTitle(`${player.character.name} · Armoury`).setDescription(armour.map((item) => `${item!.id === player.equippedArmourId ? "⚔️" : "▫️"} **${item!.name}** · Tier ${item!.tier}`).join("\n") || "Your armoury is empty.").setFooter({ text: "Use /loadout armour to equip owned armour." })], flags: MessageFlags.Ephemeral });
  },
};
