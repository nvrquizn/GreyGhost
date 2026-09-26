import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { shopItemMap, shopItems } from "../economy/catalogue.js";
import { changeRenown, getEconomyPlayer } from "../economy/store.js";
import { getGuildSettings } from "../services/guild-settings.js";
import { cancelRace, createRace, enterRace, getHorseProfile, getRace, publishRace, resolveRace, type RaceType } from "../stables/store.js";
import { createPrizePackage, finalizePrizePackage, finalizedPrizeText, isApprovedAdmirerRole, prizeAnnouncementText, type SecondPrizeMode } from "../events-manager/prizes.js";
import { grantChampionsRole } from "../events-manager/champions.js";

const mountChoices = shopItems.filter((item) => item.category === "mount").map((item) => ({ name: item.name, value: item.id }));
const typeLabel: Record<RaceType, string> = { sprint: "Sprint", distance: "Distance", cross_country: "Cross-Country", grand: "Grand Race" };
function idOption(sub: import("discord.js").SlashCommandSubcommandBuilder) { return sub.addIntegerOption((o) => o.setName("race-id").setDescription("Race number.").setMinValue(1).setRequired(true)); }

export const raceCommand: Command = {
  data: new SlashCommandBuilder().setName("race").setDescription("Host and enter horse races.").setDMPermission(false)
    .addSubcommand((sub) => sub.setName("create").setDescription("Create a draft horse race.")
      .addStringOption((o) => o.setName("title").setDescription("Race title.").setMaxLength(100).setRequired(true))
      .addStringOption((o) => o.setName("type").setDescription("Race format.").setRequired(true).addChoices(
        { name: "Sprint — Speed", value: "sprint" }, { name: "Distance — Stamina", value: "distance" }, { name: "Cross-Country — Agility + stamina", value: "cross_country" }, { name: "Grand Race — balanced", value: "grand" },
      )))
    .addSubcommand((sub) => idOption(sub.setName("publish").setDescription("Publish the race and announce prizes."))
      .addStringOption((o) => o.setName("second-reward").setDescription("Override second-place reward method.").addChoices(
        { name: "Auto", value: "auto" }, { name: "Second place chooses one", value: "player" }, { name: "Grey Ghost chooses one", value: "ghost" }, { name: "Grey Ghost chooses one + player chooses one", value: "shared" },
      ))
      .addRoleOption((o) => o.setName("second-admirer").setDescription("Optional preset Admirer role for Grey Ghost's second-place choice."))
      .addRoleOption((o) => o.setName("third-admirer").setDescription("Optional preset Admirer role for third place.")))
    .addSubcommand((sub) => idOption(sub.setName("enter").setDescription("Enter or update your horse in an open race."))
      .addStringOption((o) => o.setName("mount").setDescription("Owned horse.").setRequired(true).addChoices(...mountChoices)))
    .addSubcommand((sub) => idOption(sub.setName("start").setDescription("Run the race and determine the finish.")))
    .addSubcommand((sub) => idOption(sub.setName("status").setDescription("View a race roster and status.")))
    .addSubcommand((sub) => idOption(sub.setName("cancel").setDescription("Cancel an unfinished race."))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    const settings = await getGuildSettings(interaction.guildId);
    if (sub === "create") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) { await interaction.reply({ content: "You need **Manage Events** to host a horse race.", flags: MessageFlags.Ephemeral }); return; }
      const race = await createRace(interaction.guildId, { title: interaction.options.getString("title", true), type: interaction.options.getString("type", true) as RaceType, hostId: interaction.user.id, channelId: interaction.channelId });
      await interaction.reply({ content: `Created draft race **#${race.id} · ${race.title}**. Publish it with \`/race publish race-id:${race.id}\`.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const raceId = interaction.options.getInteger("race-id", true);
    const race = await getRace(interaction.guildId, raceId);
    if (!race) { await interaction.reply({ content: `Race #${raceId} was not found.`, flags: MessageFlags.Ephemeral }); return; }
    const canHost = interaction.user.id === race.hostId || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
    if (sub === "enter") {
      const player = await getEconomyPlayer(interaction.guildId, interaction.user.id);
      if (!player) { await interaction.reply({ content: "Create your Realm character first with `/character create`.", flags: MessageFlags.Ephemeral }); return; }
      try {
        const updated = await enterRace(interaction.guildId, raceId, interaction.user.id, interaction.options.getString("mount", true));
        const horse = await getHorseProfile(interaction.guildId, interaction.user.id, updated.entrants[interaction.user.id]!.mountId);
        await interaction.reply({ content: `**${horse?.name ?? "Your horse"}** entered **${updated.title}**.`, flags: MessageFlags.Ephemeral });
      } catch (error) { await interaction.reply({ content: (error as Error).message === "HORSE_NOT_OWNED" ? "You do not own that horse." : "That race is not accepting entries.", flags: MessageFlags.Ephemeral }); }
      return;
    }
    if (sub === "status") {
      const lines = await Promise.all(Object.values(race.entrants).map(async (entrant) => {
        const horse = await getHorseProfile(interaction.guildId, entrant.userId, entrant.mountId);
        return `<@${entrant.userId}> — **${horse?.name ?? shopItemMap.get(entrant.mountId)?.name ?? entrant.mountId}**${entrant.place ? ` · #${entrant.place}` : ""}`;
      }));
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8b6f47).setTitle(`Race #${race.id} · ${race.title}`).setDescription(lines.join("\n") || "No riders have entered.").addFields({ name: "Type", value: typeLabel[race.type], inline: true }, { name: "Status", value: race.status, inline: true })] });
      return;
    }
    if (!canHost) { await interaction.reply({ content: "Only the race host or a server manager may do that.", flags: MessageFlags.Ephemeral }); return; }
    if (sub === "publish") {
      const eventChatId = settings.eventChatChannelId ?? settings.eventChannelId;
      if (!settings.eventAnnouncementChannelId || !eventChatId) { await interaction.reply({ content: "Configure both `/setup event-channel` and `/setup event-chat` before publishing competitions.", flags: MessageFlags.Ephemeral }); return; }
      const secondMode = (interaction.options.getString("second-reward") ?? "auto") as SecondPrizeMode | "auto";
      const secondRole = interaction.options.getRole("second-admirer"); const thirdRole = interaction.options.getRole("third-admirer");
      if ((secondRole && !isApprovedAdmirerRole(secondRole)) || (thirdRole && !isApprovedAdmirerRole(thirdRole))) { await interaction.reply({ content: "Preset prizes must be approved Admirer roles.", flags: MessageFlags.Ephemeral }); return; }
      try {
        const opened = await publishRace(interaction.guildId, raceId, settings.eventAnnouncementChannelId);
        const pack = await createPrizePackage(interaction.guild, { kind: "race", eventId: raceId, title: opened.title, secondMode, secondRole, thirdRole });
        const channel = await interaction.guild.channels.fetch(settings.eventAnnouncementChannelId);
        if (!channel?.isSendable()) throw new Error("EVENT_CHANNEL_INVALID");
        const summons = settings.tourneySummonsRoleId ? `<@&${settings.tourneySummonsRoleId}>` : undefined;
        await channel.send({
          content: summons ? `${summons} — go to <#${eventChatId}> and type \`/race enter race-id:${raceId}\` to join.` : `Go to <#${eventChatId}> and type \`/race enter race-id:${raceId}\` to join.`,
          allowedMentions: settings.tourneySummonsRoleId ? { roles: [settings.tourneySummonsRoleId] } : undefined,
          embeds: [new EmbedBuilder().setColor(0x8b6f47).setTitle(`Horse Race #${raceId} · ${opened.title}`).setDescription(`**${typeLabel[opened.type]}** · The course is open.`).addFields({ name: "Rewards", value: prizeAnnouncementText(pack) }).setFooter({ text: "Top three receive the configured Champions role." })],
        });
        await interaction.reply({ content: `Race #${raceId} published in <#${settings.eventAnnouncementChannelId}>.`, flags: MessageFlags.Ephemeral });
      } catch (error) { await interaction.reply({ content: `The race could not be published: ${(error as Error).message}.`, flags: MessageFlags.Ephemeral }); }
      return;
    }
    if (sub === "cancel") { await cancelRace(interaction.guildId, raceId); await interaction.reply(`**${race.title}** has been cancelled.`); return; }
    try {
      const result = await resolveRace(interaction.guildId, raceId);
      await grantChampionsRole(interaction.guild, result.podiumIds);
      const prize = await finalizePrizePackage(interaction.guild, `race:${raceId}`, result.podiumIds);
      await Promise.all(result.podiumIds.map((userId, index) => changeRenown(interaction.guildId, userId, [5, 3, 2][index] ?? 1).catch(() => undefined)));
      const finishers = Object.values(result.race.entrants).filter((entry) => entry.place).sort((a, b) => a.place! - b.place!);
      const lines = await Promise.all(finishers.map(async (entry) => {
        const horse = await getHorseProfile(interaction.guildId, entry.userId, entry.mountId);
        return `${["🥇", "🥈", "🥉"][entry.place! - 1] ?? `${entry.place}.`} <@${entry.userId}> on **${horse?.name ?? shopItemMap.get(entry.mountId)?.name ?? entry.mountId}** — ${entry.score?.toFixed(1)}`;
      }));
      const channel = await interaction.guild.channels.fetch(result.race.channelId);
      if (channel?.isSendable()) await channel.send({ embeds: [new EmbedBuilder().setColor(0xd4af37).setTitle(`${result.race.title} · Final Results`).setDescription(lines.join("\n")).addFields(...(prize ? [{ name: "Prizes", value: finalizedPrizeText(prize).slice(0, 1024) }] : []))] });
      await interaction.reply({ content: `**${result.race.title}** is complete.`, flags: MessageFlags.Ephemeral });
    } catch (error) { await interaction.reply({ content: (error as Error).message === "NOT_ENOUGH_RACERS" ? "At least **2 riders** are required." : `The race could not start: ${(error as Error).message}.`, flags: MessageFlags.Ephemeral }); }
  },
};
