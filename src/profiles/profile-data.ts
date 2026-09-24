import type { GuildMember } from "discord.js";
import {
  getGuildSettings,
  getMemberProfile,
  saveMemberProfile,
} from "../services/guild-settings.js";

export async function getAdmirerRoleIds(guildId: string): Promise<Set<string>> {
  const settings = await getGuildSettings(guildId);
  const titleRoleIds = new Set(
    Object.values(settings.collectionSets ?? {}).map((set) => set.titleRoleId),
  );
  const admirerRoleIds = new Set<string>();

  for (const collectionSet of Object.values(settings.collectionSets ?? {})) {
    for (const roleId of collectionSet.requirementRoleIds) {
      if (!titleRoleIds.has(roleId)) admirerRoleIds.add(roleId);
    }
  }

  return admirerRoleIds;
}

export async function cleanupMemberWishlist(member: GuildMember): Promise<boolean> {
  const profile = await getMemberProfile(member.guild.id, member.id);
  if (!profile?.wishlistRoleIds?.length) return false;

  const cleaned = profile.wishlistRoleIds.filter(
    (roleId) => member.guild.roles.cache.has(roleId) && !member.roles.cache.has(roleId),
  );
  if (cleaned.length === profile.wishlistRoleIds.length) return false;

  await saveMemberProfile(member.guild.id, member.id, { wishlistRoleIds: cleaned });
  return true;
}
