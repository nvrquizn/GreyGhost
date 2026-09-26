import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { createCharacter, getEconomyPlayer, renameCharacter, renownTitle } from "../economy/store.js";
import { shopItemMap } from "../economy/catalogue.js";
import { getDragons, getRiderDragon } from "../dragons/store.js";

function card(name: string, userMention: string, player: NonNullable<Awaited<ReturnType<typeof getEconomyPlayer>>>, dragonText?: string): EmbedBuilder {
  const mount = player.equippedMountId ? shopItemMap.get(player.equippedMountId)?.name ?? "Unknown" : "None";
  const armour = player.equippedArmourId ? shopItemMap.get(player.equippedArmourId)?.name ?? "Unknown" : "None";
  return new EmbedBuilder()
    .setColor(0xb8c2cc)
    .setTitle(`${name} · Character`)
    .setDescription(userMention)
    .addFields(
      { name: "Training", value: `Health **${player.character.health}** · Damage **${player.character.damage}** · Resistance **${player.character.resistance}**` },
      { name: "Coin", value: `**${player.coins}**`, inline: true },
      { name: "Renown", value: `**${player.character.renown}** · ${renownTitle(player.character.renown)}`, inline: true },
      { name: "Heirlooms", value: String(player.character.heirlooms.length), inline: true },
      { name: "Mount", value: mount, inline: true },
      { name: "Armour", value: armour, inline: true },
      ...(dragonText ? [{ name: "Dragon", value: dragonText, inline: true }] : []),
    )
    .setFooter({ text: "Realm character · progression, equipment, and combat" });
}

export const characterCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("character")
    .setDescription("Create or view your Realm character.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("create").setDescription("Create your Realm character.")
      .addStringOption((option) => option.setName("name").setDescription("Your character's name.").setMinLength(1).setMaxLength(40).setRequired(true)))
    .addSubcommand((sub) => sub.setName("view").setDescription("View a Realm character.")
      .addUserOption((option) => option.setName("user").setDescription("Member to view; defaults to you.")))
    .addSubcommand((sub) => sub.setName("rename").setDescription("Rename your Realm character.")
      .addStringOption((option) => option.setName("name").setDescription("The new character name.").setMinLength(1).setMaxLength(40).setRequired(true))),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "create") {
      try {
        const player = await createCharacter(interaction.guildId, interaction.user.id, interaction.options.getString("name", true));
        await interaction.reply({ embeds: [card(player.character.name, `<@${interaction.user.id}>`, player)] });
      } catch (error) {
        if ((error as Error).message === "CHARACTER_EXISTS") {
          await interaction.reply({ content: "You already have a Realm character. Use `/character rename` if you want another name.", flags: MessageFlags.Ephemeral });
          return;
        }
        throw error;
      }
      return;
    }
    if (sub === "rename") {
      try {
        const player = await renameCharacter(interaction.guildId, interaction.user.id, interaction.options.getString("name", true));
        await interaction.reply({ content: `Your character is now **${player.character.name}**.`, flags: MessageFlags.Ephemeral });
      } catch (error) {
        if ((error as Error).message === "CHARACTER_REQUIRED") {
          await interaction.reply({ content: "Create your character first with `/character create`.", flags: MessageFlags.Ephemeral });
          return;
        }
        throw error;
      }
      return;
    }
    const user = interaction.options.getUser("user") ?? interaction.user;
    const player = await getEconomyPlayer(interaction.guildId, user.id);
    if (!player) {
      await interaction.reply({ content: user.id === interaction.user.id ? "You have not created a Realm character yet. Use `/character create`." : "That member has not created a Realm character yet.", flags: MessageFlags.Ephemeral });
      return;
    }
    const bondedDragon = await getRiderDragon(interaction.guildId, user.id);
    const formerDragon = bondedDragon ? undefined : (await getDragons(interaction.guildId)).find((dragon) => dragon.formerRiderIds.includes(user.id));
    const dragonText = bondedDragon ? `🐉 **${bondedDragon.name}** · Bonded` : formerDragon ? `🐉 **${formerDragon.name}** · Wild` : undefined;
    await interaction.reply({ embeds: [card(player.character.name, `<@${user.id}>`, player, dragonText)] });
  },
};
