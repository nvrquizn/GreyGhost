import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { shopItemMap } from "../economy/catalogue.js";
import { getEconomyPlayer } from "../economy/store.js";

export const stableCommand: Command = {
  data: new SlashCommandBuilder().setName("stable").setDescription("View your owned mounts.").setDMPermission(false),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const player = await getEconomyPlayer(interaction.guildId, interaction.user.id);
    if (!player) { await interaction.reply({ content: "Create your Realm character first with `/character create`.", flags: MessageFlags.Ephemeral }); return; }
    const mounts = player.inventory.map((id) => shopItemMap.get(id)).filter((item) => item?.category === "mount");
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xb8c2cc).setTitle(`${player.character.name} · Stable`).setDescription(mounts.map((item) => `${item!.id === player.equippedMountId ? "⚔️" : "▫️"} **${item!.name}** · Tier ${item!.tier}`).join("\n") || "Your stable is empty.").setFooter({ text: "Use /loadout mount to equip an owned horse." })], flags: MessageFlags.Ephemeral });
  },
};
