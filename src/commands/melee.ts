import { recordHouseEventPodium } from "../housechronicles/runtime.js";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { applyJoustInjury, grantCoins, changeRenown } from "../economy/store.js";
import { addChronicleEntry, awardAchievement, changeHousePoints, getChronicleEntries, getGuildSettings } from "../services/guild-settings.js";
import { publishChronicleEntry } from "../chronicles/runtime.js";
import { cancelMelee, createMelee, enterMelee, getMelee, publishMelee, resolveMeleeRound, startMelee, type Melee } from "../combat/store.js";
import { grantChampionsRole } from "../events-manager/champions.js";
import { awardFestivalPlacement, recordFestivalActivity } from "../festivals/store.js";
import { createPrizePackage, finalizePrizePackage, finalizedPrizeText, isApprovedAdmirerRole, prizeAnnouncementText, type SecondPrizeMode } from "../events-manager/prizes.js";

function canHost(interaction: { member: { permissions: { has(permission: bigint): boolean } }; user: { id: string } }, melee: Melee): boolean {
  return interaction.user.id === melee.hostId || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function roster(melee: Melee): string {
  const entrants = Object.values(melee.entrants);
  return entrants.length ? entrants.map((entrant) => `${entrant.active ? "⚔️" : "☠️"} <@${entrant.userId}> · <@&${entrant.houseRoleId}> · **${entrant.wins}** win${entrant.wins === 1 ? "" : "s"}`).join("\n") : "No fighters have entered.";
}


function meleePodiumIds(melee: Melee): string[] {
  const eliminated = new Map(melee.matches.map((match) => [match.loserId, match.round]));
  return Object.values(melee.entrants)
    .sort((left, right) =>
      Number(right.active) - Number(left.active)
      || (eliminated.get(right.userId) ?? Number.MAX_SAFE_INTEGER) - (eliminated.get(left.userId) ?? Number.MAX_SAFE_INTEGER)
      || right.wins - left.wins
      || left.userId.localeCompare(right.userId),
    )
    .slice(0, 3)
    .map((entrant) => entrant.userId);
}

function idOption(sub: import("discord.js").SlashCommandSubcommandBuilder) {
  return sub.addIntegerOption((option) => option.setName("melee-id").setDescription("Grand melee number.").setMinValue(1).setRequired(true));
}

export const meleeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("melee")
    .setDescription("Enter and host horse-free grand melees.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("create").setDescription("Open a grand melee in this channel.")
      .addStringOption((option) => option.setName("title").setDescription("Melee title.").setMaxLength(100).setRequired(true)))
    .addSubcommand((sub) => idOption(sub.setName("publish").setDescription("Publish the grand melee and announce its prizes."))
      .addStringOption((option) => option.setName("second-reward").setDescription("Override Grey Ghost's second-place reward method.").addChoices(
        { name: "Auto", value: "auto" },
        { name: "Second place chooses one", value: "player" },
        { name: "Grey Ghost chooses one", value: "ghost" },
        { name: "Grey Ghost chooses one + second place chooses one", value: "shared" },
      ))
      .addRoleOption((option) => option.setName("second-admirer").setDescription("Optional preset Admirer role for second place."))
      .addRoleOption((option) => option.setName("third-admirer").setDescription("Optional preset Admirer role for third place.")))
    .addSubcommand((sub) => idOption(sub.setName("enter").setDescription("Enter an open grand melee."))
      .addRoleOption((option) => option.setName("house").setDescription("The House you represent.").setRequired(true)))
    .addSubcommand((sub) => idOption(sub.setName("start").setDescription("Close entries and begin the melee.")))
    .addSubcommand((sub) => idOption(sub.setName("next").setDescription("Fight the next elimination round.")))
    .addSubcommand((sub) => idOption(sub.setName("status").setDescription("View a grand melee's roster and state.")))
    .addSubcommand((sub) => idOption(sub.setName("cancel").setDescription("Cancel an unfinished grand melee."))),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "create") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
        await interaction.reply({ content: "You need **Manage Events** to host a grand melee.", flags: MessageFlags.Ephemeral });
        return;
      }
      const melee = await createMelee(interaction.guildId, { title: interaction.options.getString("title", true), hostId: interaction.user.id, channelId: interaction.channelId });
      await interaction.reply({ content: `Created draft grand melee **#${melee.id} · ${melee.title}**. Publish it with \`/melee publish melee-id:${melee.id}\`.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const meleeId = interaction.options.getInteger("melee-id", true);
    const melee = await getMelee(interaction.guildId, meleeId);
    if (!melee) { await interaction.reply({ content: `Grand melee #${meleeId} was not found.`, flags: MessageFlags.Ephemeral }); return; }

    if (sub === "publish") {
      if (!canHost(interaction, melee)) { await interaction.reply({ content: "Only the host or a server manager may publish this melee.", flags: MessageFlags.Ephemeral }); return; }
      const secondMode = (interaction.options.getString("second-reward") ?? "auto") as SecondPrizeMode | "auto";
      const secondRole = interaction.options.getRole("second-admirer");
      const thirdRole = interaction.options.getRole("third-admirer");
      if (secondRole && secondMode === "player") {
        await interaction.reply({ content: "If second place is choosing their own prize, leave `second-admirer` blank or use Grey Ghost/shared.", flags: MessageFlags.Ephemeral });
        return;
      }
      if ((secondRole && !isApprovedAdmirerRole(secondRole)) || (thirdRole && !isApprovedAdmirerRole(thirdRole))) {
        await interaction.reply({ content: "Preset prizes must be roles from Grey Ghost's approved Admirer-role pool.", flags: MessageFlags.Ephemeral });
        return;
      }
      try {
        const settings = await getGuildSettings(interaction.guildId);
        const eventChatId = settings.eventChatChannelId ?? settings.eventChannelId;
        if (!settings.eventAnnouncementChannelId || !eventChatId) {
          await interaction.reply({ content: "Configure both `/setup event-channel` and `/setup event-chat` before publishing competitions.", flags: MessageFlags.Ephemeral });
          return;
        }
        const opened = await publishMelee(interaction.guildId, meleeId, settings.eventAnnouncementChannelId);
        const pack = await createPrizePackage(interaction.guild, { kind: "melee", eventId: meleeId, title: opened.title, secondMode, secondRole, thirdRole });
        const summons = settings.tourneySummonsRoleId ? `<@&${settings.tourneySummonsRoleId}>` : undefined;
        const publishChannel = await interaction.guild.channels.fetch(settings.eventAnnouncementChannelId).catch(() => null);
        if (!publishChannel?.isSendable()) throw new Error("MELEE_CHANNEL_INVALID");
        await publishChannel.send({
          content: summons ? `${summons} — go to <#${eventChatId}> and type \`/melee enter melee-id:${opened.id}\` to join.` : `Go to <#${eventChatId}> and type \`/melee enter melee-id:${opened.id}\` to join.`,
          allowedMentions: summons ? { roles: [settings.tourneySummonsRoleId!] } : undefined,
          embeds: [new EmbedBuilder().setColor(0x7b2d26).setTitle(`Grand Melee #${opened.id} · ${opened.title}`).setDescription(`The field is open. Enter with \`/melee enter melee-id:${opened.id}\`.\n\n**No horses:** trained character stats and equipped armour are used automatically.`).addFields({ name: "Rewards", value: prizeAnnouncementText(pack) }).setFooter({ text: "Last fighter standing wins." })],
        });
        await interaction.reply({ content: `Grand melee #${meleeId} published.`, flags: MessageFlags.Ephemeral });
      } catch {
        await interaction.reply({ content: "That melee cannot be published.", flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (sub === "enter") {
      const house = interaction.options.getRole("house", true);
      const configured = (await getGuildSettings(interaction.guildId)).selfRolePanels?.houses?.roles.map((entry) => entry.roleId) ?? [];
      if (!configured.includes(house.id)) { await interaction.reply({ content: "Choose one of the configured House roles.", flags: MessageFlags.Ephemeral }); return; }
      try {
        const updated = await enterMelee(interaction.guildId, meleeId, interaction.user.id, house.id);
        await interaction.reply({ content: `You entered **${updated.title}** for <@&${house.id}>.`, flags: MessageFlags.Ephemeral });
      } catch (error) {
        const message = (error as Error).message === "CHARACTER_REQUIRED" ? "Create a character with `/character create` before entering a grand melee." : "That melee is no longer accepting entrants.";
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (sub === "status") {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x7b2d26).setTitle(`Grand Melee #${melee.id} · ${melee.title}`).setDescription(roster(melee).slice(0, 4096)).addFields({ name: "Status", value: melee.status, inline: true }, { name: "Round", value: String(melee.round), inline: true })] });
      return;
    }

    if (!canHost(interaction, melee)) { await interaction.reply({ content: "Only the host or a server manager may do that.", flags: MessageFlags.Ephemeral }); return; }

    if (sub === "start") {
      try {
        const updated = await startMelee(interaction.guildId, meleeId);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xd4af37).setTitle(`${updated.title} · The Field Is Sealed`).setDescription(roster(updated).slice(0, 4096)).setFooter({ text: "Use /melee next to resolve each elimination round." })] });
      } catch (error) {
        await interaction.reply({ content: (error as Error).message === "NOT_ENOUGH_MELEE_ENTRANTS" ? "At least **2 fighters** are required." : "That melee cannot be started.", flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (sub === "cancel") {
      await cancelMelee(interaction.guildId, meleeId);
      await interaction.reply(`**${melee.title}** has been cancelled.`);
      return;
    }

    try {
      const result = await resolveMeleeRound(interaction.guildId, meleeId);
      const lines = result.matches.map((match) => `<@${match.leftId}> **${match.leftScore}** vs **${match.rightScore}** <@${match.rightId}> → <@${match.winnerId}> advances.`);
      const injuries = (await Promise.all(result.matches.map(async (match) => {
        const winnerHouse = result.melee.entrants[match.winnerId]?.houseRoleId;
        if (winnerHouse) await changeHousePoints(interaction.guildId, { houseRoleId: winnerHouse, delta: 2, reason: `Grand melee #${meleeId}: round ${result.melee.round} victory`, memberId: match.winnerId, staffId: interaction.user.id });
        const injured = await applyJoustInjury(interaction.guildId, match.loserId, `Grand melee #${meleeId}, round ${result.melee.round}`);
        return injured?.injury ? `<@${match.loserId}> is **${injured.injury.severity}**.` : undefined;
      }))).filter((line): line is string => Boolean(line));

      const embed = new EmbedBuilder().setColor(0xb87333).setTitle(`${result.melee.title} · Round ${result.melee.round}`).setDescription(lines.join("\n").slice(0, 4096) || "No bouts were required.").addFields(
        { name: "Byes", value: result.byes.length ? result.byes.map((id) => `<@${id}>`).join("\n") : "None", inline: true },
        { name: "Injuries", value: injuries.join("\n").slice(0, 1024) || "None" },
      );

      if (result.melee.status === "finished" && result.melee.championId) {
        const championId = result.melee.championId;
        await grantCoins(interaction.guildId, championId, 20, "Grey Ghost", `Grand melee #${meleeId} champion reward`);
        const houseRoleId = result.melee.entrants[championId]?.houseRoleId;
        if (houseRoleId) await changeHousePoints(interaction.guildId, { houseRoleId, delta: 5, reason: `Grand melee #${meleeId} champion`, memberId: championId, staffId: interaction.user.id });
        await awardAchievement(interaction.guildId, championId, "melee-champion");
        const podiumIds = meleePodiumIds(result.melee);
        await grantChampionsRole(interaction.guild, podiumIds);
        const prizeResult = await finalizePrizePackage(interaction.guild, `melee:${meleeId}`, podiumIds);
        await Promise.all(podiumIds.map((userId, index) => changeRenown(interaction.guildId, userId, [5, 3, 2][index] ?? 1).catch(() => undefined)));
        await Promise.all(Object.keys(result.melee.entrants).map((userId) => recordFestivalActivity(interaction.guildId, userId, "melee").catch(() => undefined)));
        await Promise.all(podiumIds.map((userId, index) => awardFestivalPlacement(interaction.guildId, userId, [8, 5, 3][index] ?? 1, [5, 3, 2][index] ?? 1).catch(() => undefined)));
        await recordHouseEventPodium(interaction.guild, { eventType: "the grand melee", title: result.melee.title, podiumIds, sourceKey: `melee:${meleeId}` }).catch(() => undefined);
        embed.setColor(0xd4af37).addFields(
          { name: "Champion", value: `<@${championId}> wins **20 coins**, **5 bonus House Points**, and the **Grand Melee Champion** achievement.` },
          ...(prizeResult ? [{ name: "Prizes", value: finalizedPrizeText(prizeResult).slice(0, 1024) }] : []),
        );

        const sourceKey = `melee:${meleeId}`;
        const already = (await getChronicleEntries(interaction.guildId)).some((entry) => entry.sourceKey === sourceKey);
        const entry = await addChronicleEntry(interaction.guildId, { type: "melee_champion", title: `${result.melee.title} · Grand Melee Champion`, description: `<@${championId}> stood last upon the field and claimed the grand melee.`, occurredAt: Date.now(), relatedUserIds: [championId], relatedRoleIds: houseRoleId ? [houseRoleId] : [], sourceKey });
        if (!already) await publishChronicleEntry(interaction.guild, entry);
      }
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await interaction.reply({ content: `The melee could not advance: ${(error as Error).message}.`, flags: MessageFlags.Ephemeral });
    }
  },
};
