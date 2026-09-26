import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { getEconomyPlayer, executeTradeTransfer } from "../economy/store.js";
import { shopItemMap, shopItems } from "../economy/catalogue.js";
import { cancelTrade, completeTradeRecord, confirmTrade, createTrade, getActiveTradeForUser, updateTradeOffer, type Trade } from "../trades/store.js";

const tradableItems = shopItems.filter((item) => !((item.category === "mount" || item.category === "armour") && item.tier === 1));

function itemChoices(option: import("discord.js").SlashCommandStringOption) {
  return option.addChoices(...tradableItems.map((item) => ({ name: item.name, value: item.id })));
}

function offerText(trade: Trade, userId: string): string {
  const offer = trade.offers[userId] ?? { coins: 0, itemIds: [] };
  const counts = new Map<string, number>();
  for (const id of offer.itemIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const items = [...counts.entries()].map(([id, count]) => `${shopItemMap.get(id)?.name ?? id}${count > 1 ? ` ×${count}` : ""}`);
  return [`**${offer.coins} coins**`, ...(items.length ? items : ["No items"]), trade.confirmedUserIds.includes(userId) ? "✅ Confirmed" : "⏳ Not confirmed"].join("\n");
}

function tradeEmbed(trade: Trade): EmbedBuilder {
  return new EmbedBuilder().setColor(0x8a7356).setTitle(`Trade #${trade.id}`).setDescription("Both sides must confirm the same offer before anything changes hands.").addFields(
    { name: `Offer · <@${trade.initiatorId}>`, value: offerText(trade, trade.initiatorId), inline: true },
    { name: `Offer · <@${trade.partnerId}>`, value: offerText(trade, trade.partnerId), inline: true },
  ).setFooter({ text: "Changing either offer clears both confirmations." }).setTimestamp(trade.updatedAt);
}

async function currentTrade(guildId: string, userId: string) {
  const trade = await getActiveTradeForUser(guildId, userId);
  if (!trade) throw new Error("NO_ACTIVE_TRADE");
  return trade;
}

export const tradeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Trade coins and inventory items with another character.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("offer").setDescription("Open a trade with another member.")
      .addUserOption((option) => option.setName("user").setDescription("The member you want to trade with.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("add-item").setDescription("Add one owned item to your current offer.")
      .addStringOption((option) => itemChoices(option.setName("item").setDescription("Item to offer.").setRequired(true))))
    .addSubcommand((sub) => sub.setName("remove-item").setDescription("Remove one item from your current offer.")
      .addStringOption((option) => itemChoices(option.setName("item").setDescription("Item to remove.").setRequired(true))))
    .addSubcommand((sub) => sub.setName("coins").setDescription("Set how many coins you are offering.")
      .addIntegerOption((option) => option.setName("amount").setDescription("Coins offered; use 0 to clear.").setMinValue(0).setMaxValue(Number.MAX_SAFE_INTEGER).setRequired(true)))
    .addSubcommand((sub) => sub.setName("status").setDescription("View your current trade."))
    .addSubcommand((sub) => sub.setName("confirm").setDescription("Confirm your current trade offer."))
    .addSubcommand((sub) => sub.setName("cancel").setDescription("Cancel your current trade.")),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === "offer") {
        const partner = interaction.options.getUser("user", true);
        if (partner.bot) { await interaction.reply({ content: "You cannot trade with a bot.", flags: MessageFlags.Ephemeral }); return; }
        if (!await getEconomyPlayer(interaction.guildId, interaction.user.id) || !await getEconomyPlayer(interaction.guildId, partner.id)) {
          await interaction.reply({ content: "Both members need Realm characters before trading.", flags: MessageFlags.Ephemeral }); return;
        }
        const trade = await createTrade(interaction.guildId, interaction.user.id, partner.id);
        await interaction.reply({ content: `<@${partner.id}>, <@${interaction.user.id}> opened Trade #${trade.id}.`, embeds: [tradeEmbed(trade)], allowedMentions: { users: [partner.id, interaction.user.id] } });
        return;
      }
      const trade = await currentTrade(interaction.guildId, interaction.user.id);
      if (sub === "status") { await interaction.reply({ embeds: [tradeEmbed(trade)] }); return; }
      if (sub === "cancel") {
        await cancelTrade(interaction.guildId, trade.id, interaction.user.id);
        await interaction.reply(`Trade #${trade.id} has been cancelled.`); return;
      }
      if (sub === "coins") {
        const amount = interaction.options.getInteger("amount", true);
        const player = await getEconomyPlayer(interaction.guildId, interaction.user.id);
        if (!player || player.coins < amount) { await interaction.reply({ content: "You do not currently have that many coins.", flags: MessageFlags.Ephemeral }); return; }
        const updated = await updateTradeOffer(interaction.guildId, trade.id, interaction.user.id, (offer) => { offer.coins = amount; });
        await interaction.reply({ embeds: [tradeEmbed(updated)] }); return;
      }
      if (sub === "add-item") {
        const itemId = interaction.options.getString("item", true);
        const player = await getEconomyPlayer(interaction.guildId, interaction.user.id);
        const alreadyOffered = trade.offers[interaction.user.id]?.itemIds.filter((id) => id === itemId).length ?? 0;
        const owned = player?.inventory.filter((id) => id === itemId).length ?? 0;
        if (owned <= alreadyOffered) { await interaction.reply({ content: "You do not own another copy of that item to offer.", flags: MessageFlags.Ephemeral }); return; }
        const updated = await updateTradeOffer(interaction.guildId, trade.id, interaction.user.id, (offer) => { offer.itemIds.push(itemId); });
        await interaction.reply({ embeds: [tradeEmbed(updated)] }); return;
      }
      if (sub === "remove-item") {
        const itemId = interaction.options.getString("item", true);
        const updated = await updateTradeOffer(interaction.guildId, trade.id, interaction.user.id, (offer) => {
          const index = offer.itemIds.indexOf(itemId);
          if (index < 0) throw new Error("ITEM_NOT_OFFERED");
          offer.itemIds.splice(index, 1);
        });
        await interaction.reply({ embeds: [tradeEmbed(updated)] }); return;
      }
      const confirmed = await confirmTrade(interaction.guildId, trade.id, interaction.user.id);
      if (confirmed.confirmedUserIds.length < 2) {
        const other = confirmed.initiatorId === interaction.user.id ? confirmed.partnerId : confirmed.initiatorId;
        await interaction.reply({ content: `<@${other}>, the other side has confirmed Trade #${confirmed.id}.`, embeds: [tradeEmbed(confirmed)], allowedMentions: { users: [other] } });
        return;
      }
      await executeTradeTransfer(
        interaction.guildId,
        confirmed.initiatorId,
        confirmed.partnerId,
        confirmed.offers[confirmed.initiatorId]!,
        confirmed.offers[confirmed.partnerId]!,
      );
      const completed = await completeTradeRecord(interaction.guildId, confirmed.id);
      await interaction.reply({ content: `Trade #${completed.id} is complete.`, embeds: [tradeEmbed(completed)] });
    } catch (error) {
      const code = (error as Error).message;
      const messages: Record<string, string> = {
        CANNOT_TRADE_SELF: "You cannot open a trade with yourself.",
        ACTIVE_TRADE_EXISTS: "You already have an active trade.",
        PARTNER_BUSY: "That member is already in another active trade.",
        NO_ACTIVE_TRADE: "You do not have an active trade.",
        ITEM_NOT_OFFERED: "That item is not currently in your offer.",
        TRADE_INSUFFICIENT_COINS: "One side no longer has the coins they offered. Adjust the offer and confirm again.",
        TRADE_ITEM_NOT_OWNED: "One side no longer owns all of the items they offered. Adjust the trade and confirm again.",
        STARTER_ITEM_BOUND: "Starter mounts and armour cannot be traded.",
      };
      await interaction.reply({ content: messages[code] ?? `The trade could not be completed: ${code}.`, flags: MessageFlags.Ephemeral });
    }
  },
};
