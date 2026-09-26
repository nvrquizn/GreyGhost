import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { claimSpoil, getMemberSpoils, ransomSpoil, settleExpiredSpoils, type SpoilClaim } from "../combat/store.js";
import { shopItemMap } from "../economy/catalogue.js";

function describe(claim: SpoilClaim, viewerId: string): string {
  const role = claim.winnerId === viewerId ? "Winner" : "Loser";
  const item = claim.itemId ? shopItemMap.get(claim.itemId)?.name ?? claim.itemId : undefined;
  const status = claim.status === "pending"
    ? "Awaiting the winner's choice"
    : claim.status === "ransom"
      ? `${item} held for ransom · **${claim.ransomPrice} coins** · expires <t:${Math.floor((claim.ransomDeadlineAt ?? 0) / 1000)}:R>`
      : claim.resolution === "coins_taken"
        ? `Settled · **${claim.coinAmount ?? 0} coins** claimed`
        : claim.resolution === "ransomed"
          ? `Settled · ${item} was ransomed back`
          : `Settled · ${item ?? "equipment"} transferred to the winner`;
  return `**#${claim.id}** · Joust #${claim.joustId}, round ${claim.round} · ${role}\n<@${claim.winnerId}> defeated <@${claim.loserId}>\n${status}`;
}

export const spoilsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("spoils")
    .setDescription("Claim or ransom spoils from competitive jousts.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("status").setDescription("View your recent spoil and ransom claims."))
    .addSubcommand((sub) => sub.setName("claim").setDescription("Claim your right of spoils after a competitive tilt.")
      .addIntegerOption((option) => option.setName("claim-id").setDescription("Spoils claim number.").setMinValue(1).setRequired(true))
      .addStringOption((option) => option.setName("choice").setDescription("What to claim.").setRequired(true).addChoices(
        { name: "25% of their coins (maximum 50)", value: "coins" },
        { name: "Their best non-starter horse", value: "mount" },
        { name: "Their best non-starter armour", value: "armour" },
      )))
    .addSubcommand((sub) => sub.setName("ransom").setDescription("Pay to reclaim equipment being held as spoils.")
      .addIntegerOption((option) => option.setName("claim-id").setDescription("Spoils claim number.").setMinValue(1).setRequired(true))),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await settleExpiredSpoils(interaction.guildId);
    const sub = interaction.options.getSubcommand();

    if (sub === "status") {
      const claims = (await getMemberSpoils(interaction.guildId, interaction.user.id)).slice(0, 10);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x8b0000).setTitle("Joust Spoils & Ransoms").setDescription(claims.length ? claims.map((claim) => describe(claim, interaction.user.id)).join("\n\n").slice(0, 4096) : "You have no spoil or ransom claims.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const claimId = interaction.options.getInteger("claim-id", true);
    try {
      if (sub === "claim") {
        const choice = interaction.options.getString("choice", true) as "coins" | "mount" | "armour";
        const claim = await claimSpoil(interaction.guildId, claimId, interaction.user.id, choice);
        if (claim.status === "ransom") {
          const item = shopItemMap.get(claim.itemId!);
          await interaction.reply({ content: `You have seized **${item?.name ?? claim.itemId}**. <@${claim.loserId}> has **48 hours** to ransom it for **${claim.ransomPrice} coins**; otherwise it becomes yours.`, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: `You claimed **${claim.coinAmount ?? 0} coins** from <@${claim.loserId}>.`, flags: MessageFlags.Ephemeral });
        }
        return;
      }

      const claim = await ransomSpoil(interaction.guildId, claimId, interaction.user.id);
      const item = shopItemMap.get(claim.itemId!);
      await interaction.reply({ content: `You paid **${claim.ransomPrice} coins** and reclaimed **${item?.name ?? claim.itemId}**.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      const code = (error as Error).message;
      const messages: Record<string, string> = {
        SPOIL_NOT_FOUND: "That spoil claim does not exist.",
        SPOIL_NOT_WINNER: "Only the winner named on that claim may choose its spoils.",
        SPOIL_NOT_LOSER: "Only the defeated member named on that claim may pay its ransom.",
        SPOIL_ALREADY_CLAIMED: "That right of spoils has already been used.",
        SPOIL_NOT_RANSOMABLE: "That claim is not currently awaiting ransom.",
        NO_ELIGIBLE_SPOILS_ITEM: "That member has no eligible non-starter equipment of that type to seize.",
        NO_COINS_TO_CLAIM: "That member has no coins available to claim.",
        INSUFFICIENT_COINS: "You do not have enough coins to pay that ransom.",
      };
      await interaction.reply({ content: messages[code] ?? "Grey Ghost could not settle those spoils.", flags: MessageFlags.Ephemeral });
    }
  },
};
