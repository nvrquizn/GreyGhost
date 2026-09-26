import type { Guild } from "discord.js";

export async function grantChampionsRole(guild: Guild, userIds: string[]): Promise<void> {
  const role = guild.roles.cache.find((candidate) => candidate.name.toLowerCase() === "champions");
  if (!role || !role.editable) return;
  for (const userId of [...new Set(userIds)].slice(0, 3)) {
    const member = await guild.members.fetch(userId).catch(() => undefined);
    if (member && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(() => undefined);
  }
}
