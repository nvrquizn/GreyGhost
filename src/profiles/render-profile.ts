import { EmbedBuilder, type GuildMember } from "discord.js";
import { getGuildSettings, getMemberAchievements, getMemberProfile } from "../services/guild-settings.js";
import { getAdmirerRoleIds } from "./profile-data.js";
import { isSelfRolePanelId, selfRolePanelDefinitions } from "../selfroles/panels.js";
import { achievementDefinitions, achievementMap } from "../achievements/definitions.js";

function roleList(roleIds: string[]): string {
  return roleIds.map((roleId) => `<@&${roleId}>`).join(", ").slice(0, 1024);
}

export async function renderMemberProfile(member: GuildMember): Promise<EmbedBuilder> {
  const [settings, profile, admirerRoleIds, achievements] = await Promise.all([
    getGuildSettings(member.guild.id),
    getMemberProfile(member.guild.id, member.id),
    getAdmirerRoleIds(member.guild.id),
    getMemberAchievements(member.guild.id, member.id),
  ]);
  const collectionSets = Object.values(settings.collectionSets ?? {});
  const titleRoleIds = new Set(collectionSets.map((set) => set.titleRoleId));
  for (const role of member.guild.roles.cache.values()) {
    if (!titleRoleIds.has(role.id) && /(admirer|conquerer)/i.test(role.name)) {
      admirerRoleIds.add(role.id);
    }
  }
  const completedTitles = collectionSets.filter((set) => member.roles.cache.has(set.titleRoleId));
  const admirerCount = [...admirerRoleIds].filter((roleId) => member.roles.cache.has(roleId)).length;
  const wishlist = (profile?.wishlistRoleIds ?? []).filter(
    (roleId) => member.guild.roles.cache.has(roleId) && !member.roles.cache.has(roleId),
  );

  const embed = new EmbedBuilder()
    .setColor(profile?.color ?? 0x9da8b5)
    .setAuthor({
      name: `${member.displayName} · Realm Profile`,
      iconURL: member.user.displayAvatarURL(),
    })
    .setThumbnail(member.user.displayAvatarURL())
    .setDescription(profile?.bio ?? "No profile bio has been added yet.")
    .setFooter({
      text: `${admirerCount} admirer role${admirerCount === 1 ? "" : "s"} · ${completedTitles.length}/${collectionSets.length} titles · ${achievements.length}/${achievementDefinitions.length} achievements`,
    });

  if (profile?.favoriteCharacter || profile?.favoriteDragon) {
    embed.addFields(
      ...(profile.favoriteCharacter
        ? [{ name: "Favourite Character", value: profile.favoriteCharacter, inline: true }]
        : []),
      ...(profile.favoriteDragon
        ? [{ name: "Favourite Dragon", value: profile.favoriteDragon, inline: true }]
        : []),
    );
  }

  for (const [panelId, panel] of Object.entries(settings.selfRolePanels ?? {})) {
    const selected = panel.roles
      .map((entry) => entry.roleId)
      .filter((roleId) => member.roles.cache.has(roleId));
    const panelTitle = isSelfRolePanelId(panelId)
      ? selfRolePanelDefinitions[panelId].title
      : panel.title;
    if (selected.length) embed.addFields({ name: panelTitle, value: roleList(selected) });
  }

  embed.addFields({
    name: "Titles of the Realm",
    value: completedTitles.length
      ? roleList(completedTitles.map((set) => set.titleRoleId))
      : "No collection titles completed yet.",
  });

  embed.addFields({
    name: `Achievements · ${achievements.length}/${achievementDefinitions.length}`,
    value: achievements.length
      ? achievements.map((award) => {
          const definition = achievementMap.get(award.achievementId);
          return definition ? `${definition.emoji} **${definition.name}**` : `🏅 **${award.achievementId}**`;
        }).join("\n").slice(0, 1024)
      : "No achievements earned yet.",
  });

  embed.addFields({
    name: `Admirer Wishlist · ${wishlist.length}/5`,
    value: wishlist.length ? roleList(wishlist) : "No admirer roles currently wished for.",
  });

  const joined = member.joinedTimestamp
    ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`
    : "Unknown";
  embed.addFields({
    name: "Realm Record",
    value: `**Joined:** ${joined}\n**Account created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`,
  });

  return embed;
}
