import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { getEconomyPlayer, grantHeirloom, renameHeirloom, type HeirloomType } from "../economy/store.js";

const TYPES = ["sword", "dagger", "shield", "crown", "ring", "banner", "relic", "other"] as const;

export const heirloomCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("heirloom")
    .setDescription("View and manage named weapons and heirlooms.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("list").setDescription("View a member's heirlooms.")
      .addUserOption((option) => option.setName("user").setDescription("Member to view; defaults to you.")))
    .addSubcommand((sub) => sub.setName("view").setDescription("View one of your heirlooms.")
      .addStringOption((option) => option.setName("id").setDescription("Heirloom ID shown in /heirloom list.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("rename").setDescription("Rename one of your heirlooms.")
      .addStringOption((option) => option.setName("id").setDescription("Heirloom ID.").setRequired(true))
      .addStringOption((option) => option.setName("name").setDescription("New name.").setMinLength(1).setMaxLength(80).setRequired(true)))
    .addSubcommand((sub) => sub.setName("grant").setDescription("Grant a named weapon or heirloom to a member.")
      .addUserOption((option) => option.setName("user").setDescription("Recipient.").setRequired(true))
      .addStringOption((option) => option.setName("name").setDescription("Heirloom name.").setMaxLength(80).setRequired(true))
      .addStringOption((option) => option.setName("type").setDescription("Heirloom type.").setRequired(true).addChoices(...TYPES.map((value) => ({ name: value[0]!.toUpperCase() + value.slice(1), value }))))
      .addStringOption((option) => option.setName("description").setDescription("Lore or appearance.").setMaxLength(500))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "grant") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "Only server managers may grant heirlooms.", flags: MessageFlags.Ephemeral });
        return;
      }
      const user = interaction.options.getUser("user", true);
      try {
        const item = await grantHeirloom(interaction.guildId, user.id, { name: interaction.options.getString("name", true), type: interaction.options.getString("type", true) as HeirloomType, description: interaction.options.getString("description") ?? undefined, grantedBy: interaction.user.id });
        await interaction.reply({ content: `${user} received **${item.name}** (${item.type}) · ID \`${item.id}\`.` });
      } catch {
        await interaction.reply({ content: "That member needs a Realm character first.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (sub === "rename") {
      try {
        const item = await renameHeirloom(interaction.guildId, interaction.user.id, interaction.options.getString("id", true), interaction.options.getString("name", true));
        await interaction.reply({ content: `The heirloom is now named **${item.name}**.`, flags: MessageFlags.Ephemeral });
      } catch {
        await interaction.reply({ content: "I could not find that heirloom in your character's collection.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (sub === "view") {
      const player = await getEconomyPlayer(interaction.guildId, interaction.user.id);
      const item = player?.character.heirlooms.find((candidate) => candidate.id === interaction.options.getString("id", true));
      if (!item) { await interaction.reply({ content: "I could not find that heirloom.", flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xb8b8b8).setTitle(item.name).setDescription(item.description || "No description recorded.").addFields({ name: "Type", value: item.type, inline: true }, { name: "ID", value: `\`${item.id}\``, inline: true }).setFooter({ text: `Granted by ${item.grantedBy}` })] });
      return;
    }
    const user = interaction.options.getUser("user") ?? interaction.user;
    const player = await getEconomyPlayer(interaction.guildId, user.id);
    if (!player) { await interaction.reply({ content: "That member has no Realm character.", flags: MessageFlags.Ephemeral }); return; }
    const list = player.character.heirlooms;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8a7f70).setTitle(`${player.character.name} · Heirlooms`).setDescription(list.length ? list.map((item) => `**${item.name}** · ${item.type} · \`${item.id}\``).join("\n") : "No named weapons or heirlooms have been recorded.")] });
  },
};
