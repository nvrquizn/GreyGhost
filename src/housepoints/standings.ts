import { EmbedBuilder, type Guild } from "discord.js";
import { getGuildSettings, getHousePoints } from "../services/guild-settings.js";

export interface HouseStanding {
  roleId: string;
  emoji?: string;
  name: string;
  points: number;
}

export async function getHouseStandings(guild: Guild): Promise<HouseStanding[]> {
  const [settings, housePoints] = await Promise.all([
    getGuildSettings(guild.id),
    getHousePoints(guild.id),
  ]);
  const panel = settings.selfRolePanels?.houses;
  if (!panel) return [];

  return panel.roles
    .flatMap((entry): HouseStanding[] => {
      const role = guild.roles.cache.get(entry.roleId);
      if (!role) return [];
      return [{
        roleId: role.id,
        ...(entry.emoji ? { emoji: entry.emoji } : {}),
        name: role.name,
        points: housePoints.scores[role.id] ?? 0,
      }];
    })
    .sort((left, right) => right.points - left.points || left.name.localeCompare(right.name));
}

export function standingsLines(standings: HouseStanding[]): string[] {
  return standings.map(
    (standing, index) =>
      `**${index + 1}.** ${standing.emoji ?? "•"} <@&${standing.roleId}> — **${standing.points}** point${standing.points === 1 ? "" : "s"}`,
  );
}

export async function renderHouseStandings(guild: Guild): Promise<EmbedBuilder> {
  const standings = await getHouseStandings(guild);
  const leadingPoints = standings[0]?.points ?? 0;
  const leaders = leadingPoints
    ? standings.filter((standing) => standing.points === leadingPoints)
    : [];

  return new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(`${guild.name} · House Standings`)
    .setDescription(
      standings.length
        ? standingsLines(standings).join("\n")
        : "Configure and publish the **House Allegiance** self-role panel before using House Points.",
    )
    .setThumbnail(guild.iconURL())
    .setFooter({
      text: leaders.length
        ? `${leaders.length === 1 ? (leaders[0]?.name ?? "One House") : `${leaders.length} Houses`} currently lead with ${leadingPoints} points`
        : "No House has earned points yet",
    })
    .setTimestamp();
}
