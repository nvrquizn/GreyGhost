import { EmbedBuilder, type Guild } from "discord.js";
import { getAdmirerRoleIds } from "../profiles/profile-data.js";
import { getGuildSettings } from "../services/guild-settings.js";
import { getGuildSuggestions } from "../services/suggestions.js";
import { selfRolePanelDefinitions } from "../selfroles/panels.js";
import { getHouseStandings, standingsLines } from "../housepoints/standings.js";

function chunkLines(lines: string[], maximumLength = 1024): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maximumLength) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = line;
  }

  if (current) chunks.push(current);
  return chunks;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function rankedRoles(
  guild: Guild,
  roleIds: Iterable<string>,
  limit: number,
): Array<{ id: string; count: number }> {
  return [...new Set(roleIds)]
    .map((roleId) => {
      const role = guild.roles.cache.get(roleId);
      const count = role?.members.filter((member) => !member.user.bot).size ?? 0;
      return { id: roleId, count };
    })
    .filter((entry) => guild.roles.cache.has(entry.id) && entry.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

function rankingText(entries: Array<{ id: string; count: number }>, empty: string): string {
  return entries.length
    ? entries.map((entry, index) => `**${index + 1}.** <@&${entry.id}> — ${entry.count}`).join("\n")
    : empty;
}

export async function renderServerStats(guild: Guild): Promise<EmbedBuilder> {
  const members = await guild.members.fetch();
  const [settings, suggestions, configuredAdmirerRoleIds, houseStandings] = await Promise.all([
    getGuildSettings(guild.id),
    getGuildSuggestions(guild.id),
    getAdmirerRoleIds(guild.id),
    getHouseStandings(guild),
  ]);
  const humans = members.filter((member) => !member.user.bot);
  const bots = members.filter((member) => member.user.bot);
  const collectionSets = Object.values(settings.collectionSets ?? {});
  const titleRoleIds = new Set(collectionSets.map((set) => set.titleRoleId));

  for (const role of guild.roles.cache.values()) {
    if (!titleRoleIds.has(role.id) && /(admirer|conquerer)/i.test(role.name)) {
      configuredAdmirerRoleIds.add(role.id);
    }
  }

  const topAdmirers = rankedRoles(guild, configuredAdmirerRoleIds, 5);
  const topTitles = rankedRoles(guild, titleRoleIds, 5);
  const totalTitleAwards = [...titleRoleIds].reduce((total, roleId) => {
    const role = guild.roles.cache.get(roleId);
    return total + (role?.members.filter((member) => !member.user.bot).size ?? 0);
  }, 0);
  const titleCollectors = new Set<string>();
  for (const roleId of titleRoleIds) {
    const role = guild.roles.cache.get(roleId);
    for (const member of role?.members.values() ?? []) {
      if (!member.user.bot) titleCollectors.add(member.id);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x87ceeb)
    .setTitle(`${guild.name} · Realm Statistics`)
    .setThumbnail(guild.iconURL())
    .addFields(
      {
        name: "The Realm",
        value: [
          `**Members:** ${guild.memberCount}`,
          `**People:** ${humans.size}`,
          `**Bots:** ${bots.size}`,
          `**Realm profiles:** ${Object.keys(settings.memberProfiles ?? {}).filter((userId) => humans.has(userId)).length}`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "Collections",
        value: [
          `**Configured titles:** ${collectionSets.length}`,
          `**Titles awarded:** ${totalTitleAwards}`,
          `**Title collectors:** ${titleCollectors.size}`,
          `**Admirer roles held:** ${[...configuredAdmirerRoleIds].reduce((total, roleId) => {
            const role = guild.roles.cache.get(roleId);
            return total + (role?.members.filter((member) => !member.user.bot).size ?? 0);
          }, 0)}`,
        ].join("\n"),
        inline: true,
      },
    );

  if (houseStandings.length) {
    for (const [index, value] of chunkLines(standingsLines(houseStandings)).entries()) {
      embed.addFields({
        name: index === 0 ? "House Point Standings" : "House Point Standings · Continued",
        value,
      });
    }
  }

  for (const panelId of ["houses", "dance"] as const) {
    const panel = settings.selfRolePanels?.[panelId];
    if (!panel?.roles.length) continue;
    const lines = panel.roles
      .map((entry) => {
        const role = guild.roles.cache.get(entry.roleId);
        if (!role) return undefined;
        const count = role.members.filter((member) => !member.user.bot).size;
        return `${entry.emoji ?? "•"} ${role} — **${count}**`;
      })
      .filter((line): line is string => Boolean(line));
    if (lines.length) {
      const title = selfRolePanelDefinitions[panelId].title;
      for (const [index, value] of chunkLines(lines).entries()) {
        embed.addFields({ name: index === 0 ? title : `${title} · Continued`, value });
      }
    }
  }

  embed.addFields(
    {
      name: "Most Collected Admirer Roles",
      value: rankingText(topAdmirers, "No admirer roles have been collected yet."),
      inline: true,
    },
    {
      name: "Most Earned Titles",
      value: rankingText(topTitles, "No Titles of the Realm have been earned yet."),
      inline: true,
    },
  );

  const statuses = {
    pending: suggestions.filter((suggestion) => suggestion.status === "pending").length,
    considering: suggestions.filter((suggestion) => suggestion.status === "considering").length,
    accepted: suggestions.filter((suggestion) => suggestion.status === "accepted").length,
    denied: suggestions.filter((suggestion) => suggestion.status === "denied").length,
    implemented: suggestions.filter((suggestion) => suggestion.status === "implemented").length,
  };
  embed.addFields({
    name: "Petitions",
    value: [
      `**Submitted:** ${plural(suggestions.length, "petition")}`,
      `**Pending:** ${statuses.pending}`,
      `**Considering:** ${statuses.considering}`,
      `**Accepted:** ${statuses.accepted}`,
      `**Denied:** ${statuses.denied}`,
      `**Implemented:** ${statuses.implemented}`,
    ].join("\n"),
  });

  return embed
    .setFooter({ text: "Automatically refreshed every 15 minutes" })
    .setTimestamp();
}
