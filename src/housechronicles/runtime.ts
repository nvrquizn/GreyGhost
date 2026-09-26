import type { Guild } from "discord.js";
import { addHouseChronicleEntry, getGuildSettings } from "../services/guild-settings.js";

const placementWords = ["first", "second", "third"] as const;

export async function configuredHouseRoleIds(guildId: string): Promise<Set<string>> {
  const settings = await getGuildSettings(guildId);
  return new Set(settings.selfRolePanels?.houses?.roles.map((entry) => entry.roleId) ?? []);
}

export async function recordHouseEventPodium(
  guild: Guild,
  input: { eventType: string; title: string; podiumIds: string[]; sourceKey: string; occurredAt?: number },
): Promise<void> {
  if (!input.podiumIds.length) return;
  const houseRoleIds = await configuredHouseRoleIds(guild.id);
  if (!houseRoleIds.size) return;
  for (let index = 0; index < input.podiumIds.length && index < 3; index += 1) {
    const userId = input.podiumIds[index]!;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    const houses = member.roles.cache.filter((role) => houseRoleIds.has(role.id));
    for (const role of houses.values()) {
      const place = placementWords[index] ?? `${index + 1}th`;
      await addHouseChronicleEntry(guild.id, {
        houseRoleId: role.id,
        type: "event_placement",
        title: `${input.title} · ${place[0]!.toUpperCase()}${place.slice(1)} Place`,
        description: `<@${userId}> represented <@&${role.id}> and finished **${place}** in ${input.eventType}.`,
        occurredAt: input.occurredAt ?? Date.now(),
        relatedUserIds: [userId],
        sourceKey: `${input.sourceKey}:house:${role.id}:place:${index + 1}`,
      });
    }
  }
}
