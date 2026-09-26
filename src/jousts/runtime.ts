import { ChannelType, EmbedBuilder, type Guild } from "discord.js";
import {
  getJoust,
  getGuildSettings,
  addChronicleEntry,
  awardAchievement,
  getChronicleEntries,
  resolveJoustRound,
  startJoust,
  updateJoust,
  type Joust,
  type JoustMatch,
} from "../services/guild-settings.js";
import { refreshStatsDashboard } from "../stats/dashboard.js";
import { recordHouseEventPodium } from "../housechronicles/runtime.js";
import { applyJoustInjury, changeRenown } from "../economy/store.js";
import { publishChronicleEntry } from "../chronicles/runtime.js";
import { createJoustSpoilClaim } from "../combat/store.js";
import { grantChampionsRole } from "../events-manager/champions.js";
import { finalizePrizePackage, finalizedPrizeText, prizeAnnouncementText, type EventPrizePackage } from "../events-manager/prizes.js";
import { awardFestivalPlacement, recordFestivalActivity } from "../festivals/store.js";

function entrantLine(joust: Joust, userId: string): string {
  const entrant = joust.entrants[userId];
  if (!entrant) return `<@${userId}>`;
  const horse = entrant.horse === "destrier" ? "Destrier" : "Courser";
  return `<@${userId}> · <@&${entrant.houseRoleId}> · ${horse} · H ${entrant.health} / D ${entrant.damage} / R ${entrant.resistance}`;
}

function matchLine(match: JoustMatch): string {
  const ending = match.decidedBy === "unhorsed"
    ? "unhorsed their opponent"
    : match.decidedBy === "endurance"
      ? "held the stronger seat after three passes"
      : "won the deciding pass";
  return `<@${match.leftId}> **vs.** <@${match.rightId}> → <@${match.winnerId}> ${ending} (**+2** <@&${match.houseRoleId}>)`;
}

export function joustPodiumIds(joust: Joust): string[] {
  const eliminatedInRound = new Map(joust.matches.map((match) => [match.loserId, match.round]));
  return Object.values(joust.entrants)
    .sort((left, right) =>
      right.wins - left.wins
      || Number(right.active) - Number(left.active)
      || (eliminatedInRound.get(right.userId) ?? Number.MAX_SAFE_INTEGER)
        - (eliminatedInRound.get(left.userId) ?? Number.MAX_SAFE_INTEGER)
      || left.userId.localeCompare(right.userId),
    )
    .slice(0, 3)
    .map((entrant) => entrant.userId);
}

export function joustPodium(joust: Joust): string {
  const medals = ["🥇", "🥈", "🥉"];
  const leaders = joustPodiumIds(joust).map((userId) => joust.entrants[userId]!).filter(Boolean);
  return leaders.length
    ? leaders.map((entrant, index) => `${medals[index]} <@${entrant.userId}> — **${entrant.wins}** tilt${entrant.wins === 1 ? "" : "s"} won · <@&${entrant.houseRoleId}>`).join("\n")
    : "No riders have entered the lists.";
}

export async function publishJoustLobby(guild: Guild, joust: Joust, prizePackage?: EventPrizePackage): Promise<Joust> {
  const settings = await getGuildSettings(guild.id);
  const announcementChannelId = settings.eventAnnouncementChannelId;
  const eventChatId = settings.eventChatChannelId ?? settings.eventChannelId;
  if (!announcementChannelId || !eventChatId) throw new Error("JOUST_CHANNEL_NOT_CONFIGURED");
  const channel = await guild.channels.fetch(announcementChannelId);
  if (!channel || !channel.isSendable()) throw new Error("JOUST_CHANNEL_INVALID");
  const updated = await updateJoust(guild.id, joust.id, { status: "lobby", channelId: announcementChannelId });
  if (!updated) throw new Error("JOUST_NOT_FOUND");
  const summons = settings.tourneySummonsRoleId ? `<@&${settings.tourneySummonsRoleId}>` : undefined;
  const message = await channel.send({
    content: summons ? `${summons} — go to <#${eventChatId}> and type \`/joust enter joust-id:${joust.id}\` to join.` : `Go to <#${eventChatId}> and type \`/joust enter joust-id:${joust.id}\` to join.`,
    allowedMentions: summons ? { roles: [settings.tourneySummonsRoleId!] } : undefined,
    embeds: [new EmbedBuilder()
      .setColor(0x87ceeb)
      .setTitle(`Joust #${joust.id} · ${joust.title}`)
      .setDescription(`The lists are open. Enter with \`/joust enter joust-id:${joust.id}\` and choose your horse, House, and stat build.`)
      .addFields(
        { name: "Stat Budget", value: "Health + Damage + Resistance must equal **2**. Each stat may range from **−3 to 8**." },
        { name: "Mounts", value: "**Destrier:** greater health and resistance.\n**Courser:** greater striking power." },
        { name: "Rules", value: `No same-House tilts. If everyone selects the same House, Grey Ghost randomly spreads riders across available Houses. Each tilt won earns that House **2 points**.\n**Stakes:** ${joust.competitive ? "Competitive — winners gain a right of spoils after each tilt." : "Casual — no spoils or ransoms."}` },
        { name: "Host", value: `<@${joust.hostId}>`, inline: true },
        ...(prizePackage ? [{ name: "Rewards", value: prizeAnnouncementText(prizePackage).slice(0, 1024) }] : []),
      )
      .setFooter({ text: "You may update your entry or withdraw until the host begins." })],
  });
  return (await updateJoust(guild.id, joust.id, { lobbyMessageId: message.id })) ?? updated;
}

export async function beginJoust(guild: Guild, joustId: number): Promise<Joust> {
  const settingsJoust = await getJoust(guild.id, joustId);
  if (!settingsJoust) throw new Error("JOUST_NOT_FOUND");
  const settings = await getGuildSettings(guild.id);
  const houseRoleIds = (settings.selfRolePanels?.houses?.roles ?? [])
    .map((entry) => entry.roleId)
    .filter((roleId) => guild.roles.cache.has(roleId));
  const result = await startJoust(guild.id, joustId, houseRoleIds);
  const channel = await guild.channels.fetch(result.joust.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) throw new Error("JOUST_CHANNEL_INVALID");
  const moved = result.moved.length
    ? result.moved.map((entry) => `<@${entry.userId}>: <@&${entry.from}> → <@&${entry.to}>`).join("\n")
    : "No House reassignments were needed.";
  const roster = Object.values(result.joust.entrants).map((entrant) => entrantLine(result.joust, entrant.userId)).join("\n");
  await channel.send({ embeds: [new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(`${result.joust.title} · The Lists Are Sealed`)
    .setDescription(roster.slice(0, 4096))
    .addFields({ name: "House Balancing", value: moved.slice(0, 1024) })
    .setFooter({ text: `Joust #${joustId} · ${Object.keys(result.joust.entrants).length} competitors` })] });
  return result.joust;
}

export async function runJoustRound(guild: Guild, joustId: number, staffId: string): Promise<Joust> {
  const result = await resolveJoustRound(guild.id, joustId, staffId);
  const channel = await guild.channels.fetch(result.joust.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) throw new Error("JOUST_CHANNEL_INVALID");

  if (result.matches.length) {
    const winners = [...new Set(result.matches.map((match) => match.winnerId))];
    await Promise.all(winners.map((userId) => awardAchievement(guild.id, userId, "first-tilt")));
    const byes = result.byes.length
      ? result.byes.map((userId) => `<@${userId}> advances without a tilt.`).join("\n")
      : "No byes this round.";
    const injuries = (await Promise.all(result.matches.map(async (match) => {
      const injury = await applyJoustInjury(guild.id, match.loserId, `Joust #${result.joust.id} round ${match.round}`);
      return injury?.injury ? `<@${match.loserId}> is **${injury.injury.severity}**.` : undefined;
    }))).filter((line): line is string => Boolean(line));
    const spoils = result.joust.competitive
      ? await Promise.all(result.matches.map((match) => createJoustSpoilClaim(guild.id, { joustId: result.joust.id, round: match.round, winnerId: match.winnerId, loserId: match.loserId })))
      : [];
    const spoilLines = spoils.map((claim) => `<@${claim.winnerId}> gained **spoils claim #${claim.id}** over <@${claim.loserId}> — use \`/spoils claim\`.`);
    await channel.send({ embeds: [new EmbedBuilder()
      .setColor(0xb87333)
      .setTitle(`${result.joust.title} · Round ${result.joust.round}`)
      .setDescription(result.matches.map(matchLine).join("\n").slice(0, 4096))
      .addFields(
        { name: "Byes", value: byes.slice(0, 1024) },
        { name: "Injuries", value: injuries.join("\n").slice(0, 1024) || "No lasting injuries this round." },
        { name: "Spoils", value: spoilLines.join("\n").slice(0, 1024) || "No spoils are at stake." },
        { name: "House Points Awarded", value: String(result.pointsAwarded), inline: true },
        { name: "Top Three Riders", value: joustPodium(result.joust) },
      )
      .setFooter({ text: result.joust.status === "finished" ? "The tourney is decided." : "The host may begin the next round." })] });
    void refreshStatsDashboard(guild).catch((error) => console.error(`Could not refresh House standings for ${guild.id}:`, error));
  }

  if (result.joust.status === "finished") {
    const podiumIds = joustPodiumIds(result.joust);
    await grantChampionsRole(guild, podiumIds);
    const prizeResult = await finalizePrizePackage(guild, `joust:${result.joust.id}`, podiumIds);
    await Promise.all(podiumIds.map((userId, index) => changeRenown(guild.id, userId, [5, 3, 2][index] ?? 1).catch(() => undefined)));
    await Promise.all(Object.keys(result.joust.entrants).map((userId) => recordFestivalActivity(guild.id, userId, "joust").catch(() => undefined)));
    await Promise.all(podiumIds.map((userId, index) => awardFestivalPlacement(guild.id, userId, [8, 5, 3][index] ?? 1, [5, 3, 2][index] ?? 1).catch(() => undefined)));
    await recordHouseEventPodium(guild, { eventType: "the joust", title: result.joust.title, podiumIds, sourceKey: `joust:${result.joust.id}` }).catch(() => undefined);
    const champions = result.joust.championIds.map((userId) => entrantLine(result.joust, userId)).join("\n");
    await channel.send({ embeds: [new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle(`${result.joust.title} · Champion${result.joust.championIds.length === 1 ? "" : "s"}`)
      .setDescription(champions || "The lists closed without a champion.")
      .addFields(
        { name: "Top Three Riders", value: joustPodium(result.joust) },
        ...(prizeResult ? [{ name: "Prizes", value: finalizedPrizeText(prizeResult).slice(0, 1024) }] : []),
      )
      .setFooter({ text: result.joust.championIds.length > 1 ? "Only riders of one House remained, so they share the victory." : `Joust #${joustId} concluded` })] });
    await Promise.all(result.joust.championIds.map((userId) => awardAchievement(guild.id, userId, "tourney-champion")));
    const sourceKey = `joust:${result.joust.id}`;
    const alreadyRecorded = (await getChronicleEntries(guild.id)).some((entry) => entry.sourceKey === sourceKey);
    const entry = await addChronicleEntry(guild.id, {
      type: "joust_champion",
      title: `${result.joust.title} · Tourney Champion${result.joust.championIds.length === 1 ? "" : "s"}`,
      description: result.joust.championIds.length
        ? `${result.joust.championIds.map((userId) => `<@${userId}>`).join(" and ")} claimed victory in the lists.`
        : "The tourney concluded without a champion.",
      occurredAt: Date.now(),
      relatedUserIds: result.joust.championIds,
      relatedRoleIds: [...new Set(result.joust.championIds.map((userId) => result.joust.entrants[userId]?.houseRoleId).filter((roleId): roleId is string => Boolean(roleId)))],
      sourceKey,
    });
    if (!alreadyRecorded) await publishChronicleEntry(guild, entry);
  }
  return result.joust;
}
