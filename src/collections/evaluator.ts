import { EmbedBuilder, type GuildMember } from "discord.js";
import {
  getCollectionSets,
  getGuildSettings,
  type CollectionSet,
} from "../services/guild-settings.js";

export interface CollectionEvaluationResult {
  earned: CollectionSet[];
  removed: CollectionSet[];
}

const evaluationLocks = new Map<string, Promise<CollectionEvaluationResult>>();

export function calculateCollectionTitleRoleIds(
  collectionSets: CollectionSet[],
  currentRoleIds: Iterable<string>,
): Set<string> {
  const titleRoleIds = new Set(collectionSets.map((set) => set.titleRoleId));
  const calculatedRoleIds = new Set(
    [...currentRoleIds].filter((roleId) => !titleRoleIds.has(roleId)),
  );

  let changed = true;
  while (changed) {
    changed = false;

    for (const collectionSet of collectionSets) {
      const count = collectionSet.requirementRoleIds.filter((roleId) =>
        calculatedRoleIds.has(roleId),
      ).length;

      if (count >= collectionSet.requiredCount && !calculatedRoleIds.has(collectionSet.titleRoleId)) {
        calculatedRoleIds.add(collectionSet.titleRoleId);
        changed = true;
      }
    }
  }

  return new Set([...calculatedRoleIds].filter((roleId) => titleRoleIds.has(roleId)));
}

async function announceEarnedTitles(member: GuildMember, earned: CollectionSet[]): Promise<void> {
  if (!earned.length) return;
  const settings = await getGuildSettings(member.guild.id);
  if (!settings.collectionAnnouncementChannelId) return;

  const channel = await member.guild.channels
    .fetch(settings.collectionAnnouncementChannelId)
    .catch(() => null);
  if (!channel?.isSendable()) return;

  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(earned.length === 1 ? "A New Title of the Realm" : "New Titles of the Realm")
    .setDescription(
      `${member} has completed ${earned.length === 1 ? "a collection" : "several collections"} and earned:\n\n${earned.map((set) => `<@&${set.titleRoleId}>`).join("\n")}`,
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  await channel.send({
    embeds: [embed],
    allowedMentions: { users: [member.id], roles: [] },
  });
}

async function evaluate(
  member: GuildMember,
  announce: boolean,
): Promise<CollectionEvaluationResult> {
  member = member.guild.members.cache.get(member.id) ?? member;
  const collectionSets = await getCollectionSets(member.guild.id);
  if (!collectionSets.length) return { earned: [], removed: [] };

  const calculatedTitleRoleIds = calculateCollectionTitleRoleIds(
    collectionSets,
    member.roles.cache.keys(),
  );

  const earned = collectionSets.filter(
    (set) => calculatedTitleRoleIds.has(set.titleRoleId) && !member.roles.cache.has(set.titleRoleId),
  );
  const removed = collectionSets.filter(
    (set) => !calculatedTitleRoleIds.has(set.titleRoleId) && member.roles.cache.has(set.titleRoleId),
  );

  const addableRoleIds = earned
    .flatMap((set) => {
      const role = member.guild.roles.cache.get(set.titleRoleId);
      return role?.editable ? [role.id] : [];
    });
  const removableRoleIds = removed
    .flatMap((set) => {
      const role = member.guild.roles.cache.get(set.titleRoleId);
      return role?.editable ? [role.id] : [];
    });

  if (addableRoleIds.length) {
    await member.roles.add(addableRoleIds, "Collection requirements completed");
  }

  if (removableRoleIds.length) {
    await member.roles.remove(removableRoleIds, "Collection requirements no longer met");
  }

  const successfullyEarned = earned.filter((set) => addableRoleIds.includes(set.titleRoleId));
  if (announce && successfullyEarned.length) {
    await announceEarnedTitles(member, successfullyEarned).catch((error) => {
      console.error(`Could not announce collection titles for ${member.id}:`, error);
    });
  }

  return {
    earned: successfullyEarned,
    removed: removed.filter((set) => removableRoleIds.includes(set.titleRoleId)),
  };
}

export function evaluateMemberCollections(
  member: GuildMember,
  options: { announce?: boolean } = {},
): Promise<CollectionEvaluationResult> {
  const key = `${member.guild.id}:${member.id}`;
  const previous = evaluationLocks.get(key) ?? Promise.resolve({ earned: [], removed: [] });
  const current = previous
    .catch(() => ({ earned: [], removed: [] }))
    .then(() => evaluate(member, options.announce ?? false));

  evaluationLocks.set(key, current);
  const releaseLock = () => {
    if (evaluationLocks.get(key) === current) evaluationLocks.delete(key);
  };
  void current.then(releaseLock, releaseLock);

  return current;
}
