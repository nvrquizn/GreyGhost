import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { shopItems, shopItemMap } from "../economy/catalogue.js";
import { grantCoins, grantItem } from "../economy/store.js";

export const grantCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("grant")
    .setDescription("Give coins, armour, mounts, or supplies without spending from your own purse.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("coins").setDescription("Grant coins to a Realm character.")
      .addUserOption((option) => option.setName("member").setDescription("Member to receive the coins.").setRequired(true))
      .addIntegerOption((option) => option.setName("amount").setDescription("Coin amount to grant.").setRequired(true).setMinValue(1))
      .addStringOption((option) => option.setName("reason").setDescription("Optional ledger reason.").setMaxLength(80)))
    .addSubcommand((sub) => sub.setName("item").setDescription("Grant a mount, armour piece, or supply item.")
      .addUserOption((option) => option.setName("member").setDescription("Member to receive the item.").setRequired(true))
      .addStringOption((option) => option.setName("item").setDescription("Item to grant.").setRequired(true)
        .addChoices(...shopItems.map((item) => ({ name: `${item.name} — ${item.category}`, value: item.id }))))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();
    const member = interaction.options.getUser("member", true);

    try {
      if (subcommand === "coins") {
        const amount = interaction.options.getInteger("amount", true);
        const reason = interaction.options.getString("reason") ?? "Staff grant";
        const player = await grantCoins(interaction.guildId, member.id, amount, interaction.user.id, reason);
        await interaction.reply({ content: `Granted **${amount} coin${amount === 1 ? "" : "s"}** to ${member}. They now hold **${player.coins}**.`, flags: MessageFlags.Ephemeral });
        return;
      }

      const itemId = interaction.options.getString("item", true);
      const item = shopItemMap.get(itemId)!;
      await grantItem(interaction.guildId, member.id, itemId);
      await interaction.reply({ content: `Granted **${item.name}** to ${member}. No coins were spent.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      const code = (error as Error).message;
      if (code === "CHARACTER_REQUIRED") { await interaction.reply({ content: `${member} needs to create a Realm character first with \`/character create\`.`, flags: MessageFlags.Ephemeral }); return; }
      if (code === "ITEM_OWNED") { await interaction.reply({ content: `${member} already owns that non-stackable item.`, flags: MessageFlags.Ephemeral }); return; }
      if (code === "INVALID_AMOUNT") { await interaction.reply({ content: "Choose a positive whole-number coin amount.", flags: MessageFlags.Ephemeral }); return; }
      throw error;
    }
  },
};
