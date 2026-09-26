import type { Guild, GuildMember, Role } from "discord.js";
import { getGuildSettings, updateGuildSettings, type EventPrizePackage } from "../services/guild-settings.js";
export type { EventPrizePackage } from "../services/guild-settings.js";
import { grantChampionsRole } from "./champions.js";

export type SecondPrizeMode = "player" | "ghost" | "shared";

export const ADMIRER_ROLE_NAMES = [
  "Aegon the Conquerer", "Visenya the Conquerer", "Rhaenys the Conquerer",
  "Daenerys Admirer", "Rhaenyra Admirer", "Daemon Admirer", "Rhaenys Admirer", "Jacaerys Admirer", "Baela Admirer", "Rhaena Admirer", "Aegon II Admirer", "Aemond Admirer", "Helaena Admirer", "Daeron the Daring Admirer", "Baelor Breakspear Admirer", "Maekar Admirer", "Valarr Admirer", "Daeron the Drunken Admirer", "Aerion Brightflame Admirer", "Egg Admirer",
  "Daemon Blackfyre Admirer", "Bittersteel Admirer", "Haegon Admirer",
  "Corlys Admirer", "Laena Admirer", "Laenor Admirer", "Lucerys Admirer", "Addam Admirer", "Alyn Admirer", "Vaemond Admirer",
  "Eddard Admirer", "Catelyn Admirer", "Jon Admirer", "Robb Admirer", "Sansa Admirer", "Arya Admirer", "Bran Admirer", "Lyanna Admirer", "Cregan Admirer",
  "Tywin Admirer", "Cersei Admirer", "Jaime Admirer", "Tyrion Admirer", "Tyland Admirer",
  "Robert Admirer", "Stannis Admirer", "Renly Admirer", "Shireen Admirer", "Lyonel Admirer", "Gendry Admirer",
  "Doran Admirer", "Oberyn Admirer", "Elia Admirer", "Trystane Admirer", "Arianne Admirer",
  "Olenna Admirer", "Margaery Admirer", "Loras Admirer", "Willas Admirer", "Mace Admirer",
  "Otto Admirer", "Alicent Admirer", "Gwayne Admirer", "Ormund Admirer",
  "Night King Admirer", "Black Aly Admirer", "Bloodraven Admirer", "Ser Duncan Admirer", "Ser Arlan Admirer", "Samwell Tarly Admirer", "Misssandei Admirer", "Greyworm Admirer", "Shiera Seastar Admirer", "Brienne Admirer", "Arthur Dayne Admirer", "Aemma Admirer", "Ser Barristan Admirer", "Larys Admirer", "Melisandre Admirer", "The Hound Admirer", "The Mountain Admirer", "Varys Admirer", "Baelish Admirer",
  "Balerion Admirer", "Vhagar Admirer", "Meraxes Admirer", "The Cannibal Admirer", "Grey Ghost Admirer", "Sheepstealer Admirer", "Vermithor Admirer", "Silverwing Admirer", "Morghul Admirer", "Dreamfyre Admirer", "Caraxes Admirer", "Meleys Admirer", "Syrax Admirer", "Sunfyre Admirer", "Moondancer Admirer", "Vermax Admirer", "Arrax Admirer", "Drogon Admirer", "Rhaegal Admirer", "Viserion Admirer", "Wight Viserion Admirer", "Morning Admirer", "Seasmoke Admirer", "Tyraxes Admirer", "Tessarion Admirer", "Quicksilver Admirer", "Stormcloud Admirer", "Shrykos Admirer", "The Last Dragon Admirer",
] as const;

const ADMIRER_SET = new Set<string>(ADMIRER_ROLE_NAMES.map((name) => name.toLowerCase()));

export function isApprovedAdmirerRole(role: Role): boolean {
  return ADMIRER_SET.has(role.name.toLowerCase());
}

function eligibleRoles(guild: Guild): Role[] {
  return guild.roles.cache
    .filter((role) => isApprovedAdmirerRole(role) && role.editable)
    .map((role) => role);
}

function randomRoleName(guild: Guild, excludedNames: string[] = []): string | undefined {
  const excluded = new Set(excludedNames.map((name) => name.toLowerCase()));
  const roles = eligibleRoles(guild).filter((role) => !excluded.has(role.name.toLowerCase()));
  if (!roles.length) return undefined;
  return roles[Math.floor(Math.random() * roles.length)]!.name;
}

export async function createPrizePackage(
  guild: Guild,
  input: { kind: EventPrizePackage["kind"]; eventId: number; title: string; secondMode?: SecondPrizeMode | "auto"; secondRole?: Role | null; thirdRole?: Role | null },
): Promise<EventPrizePackage> {
  if (input.secondRole && !isApprovedAdmirerRole(input.secondRole)) throw new Error("INVALID_ADMIRER_ROLE");
  if (input.thirdRole && !isApprovedAdmirerRole(input.thirdRole)) throw new Error("INVALID_ADMIRER_ROLE");
  const settings = await getGuildSettings(guild.id);
  const key = `${input.kind}:${input.eventId}`;
  const existing = settings.eventPrizePackages?.[key];
  if (existing) return existing;
  const choices: SecondPrizeMode[] = ["player", "ghost", "shared"];
  const requestedMode = input.secondMode ?? "auto";
  if (input.secondRole && requestedMode === "player") throw new Error("SECOND_PRESET_UNUSED");
  const secondMode: SecondPrizeMode = requestedMode !== "auto"
    ? requestedMode
    : input.secondRole
      ? "ghost"
      : choices[Math.floor(Math.random() * choices.length)]!;
  const secondGhostRoleName = secondMode === "ghost" || secondMode === "shared"
    ? input.secondRole?.name ?? randomRoleName(guild)
    : undefined;
  const thirdGhostRoleName = input.thirdRole?.name ?? randomRoleName(guild, secondGhostRoleName ? [secondGhostRoleName] : []);
  const pack: EventPrizePackage = {
    key,
    kind: input.kind,
    eventId: input.eventId,
    title: input.title,
    secondMode,
    secondGhostRoleName,
    thirdGhostRoleName,
    podiumIds: [],
    claims: {},
    createdAt: Date.now(),
  };
  await updateGuildSettings(guild.id, { eventPrizePackages: { ...(settings.eventPrizePackages ?? {}), [key]: pack } });
  return pack;
}

export function prizeAnnouncementText(pack: EventPrizePackage): string {
  const second = pack.secondMode === "player"
    ? "Choose **1 Admirer role**"
    : pack.secondMode === "shared"
      ? `${pack.secondGhostRoleName ? `**${pack.secondGhostRoleName}** + ` : "Grey Ghost's choice + "}choose **1 Admirer role**`
      : pack.secondGhostRoleName ? `**${pack.secondGhostRoleName}**` : "Grey Ghost's choice of **1 Admirer role**";
  const third = pack.thirdGhostRoleName ? `**${pack.thirdGhostRoleName}**` : "Grey Ghost's choice of **1 Admirer role**";
  return [
    "🥇 **First Place** — Choose **1–2 Admirer roles**",
    `🥈 **Second Place** — ${second}`,
    `🥉 **Third Place** — ${third}`,
    "🏆 **Top Three** — Champions role",
  ].join("\n");
}

async function chooseAutomaticRole(guild: Guild, member: GuildMember, preferredName?: string, excludedIds: string[] = []): Promise<Role | undefined> {
  const eligible = eligibleRoles(guild).filter((role) => !member.roles.cache.has(role.id) && !excludedIds.includes(role.id));
  if (!eligible.length) return undefined;
  const preferred = preferredName ? eligible.find((role) => role.name.toLowerCase() === preferredName.toLowerCase()) : undefined;
  return preferred ?? eligible[Math.floor(Math.random() * eligible.length)];
}

async function awardAutomatic(guild: Guild, userId: string, preferredName?: string, excludedIds: string[] = []): Promise<string | undefined> {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return undefined;
  const role = await chooseAutomaticRole(guild, member, preferredName, excludedIds);
  if (!role) return undefined;
  await member.roles.add(role).catch(() => undefined);
  return role.id;
}

export async function finalizePrizePackage(guild: Guild, key: string, podiumIds: string[]): Promise<EventPrizePackage | undefined> {
  const settings = await getGuildSettings(guild.id);
  const current = settings.eventPrizePackages?.[key];
  if (!current) return undefined;
  if (current.finalizedAt) return current;
  const [firstId, secondId, thirdId] = podiumIds.slice(0, 3);
  await grantChampionsRole(guild, podiumIds);
  const claims: EventPrizePackage["claims"] = {};
  if (firstId) claims[firstId] = { choiceSlots: 2, chosenRoleIds: [], automaticRoleIds: [] };
  if (secondId) {
    const automaticRoleIds: string[] = [];
    if (current.secondMode === "ghost" || current.secondMode === "shared") {
      const roleId = await awardAutomatic(guild, secondId, current.secondGhostRoleName);
      if (roleId) automaticRoleIds.push(roleId);
    }
    claims[secondId] = { choiceSlots: current.secondMode === "ghost" ? 0 : 1, chosenRoleIds: [], automaticRoleIds };
  }
  if (thirdId) {
    const roleId = await awardAutomatic(guild, thirdId, current.thirdGhostRoleName);
    claims[thirdId] = { choiceSlots: 0, chosenRoleIds: [], automaticRoleIds: roleId ? [roleId] : [] };
  }
  const updated: EventPrizePackage = { ...current, podiumIds: podiumIds.slice(0, 3), claims, finalizedAt: Date.now() };
  await updateGuildSettings(guild.id, { eventPrizePackages: { ...(settings.eventPrizePackages ?? {}), [key]: updated } });
  return updated;
}

export async function claimPrizeChoices(guild: Guild, userId: string, roles: Role[]): Promise<{ package: EventPrizePackage; awarded: Role[] }> {
  const settings = await getGuildSettings(guild.id);
  const packages = Object.values(settings.eventPrizePackages ?? {})
    .filter((pack) => pack.finalizedAt && pack.claims[userId] && pack.claims[userId]!.chosenRoleIds.length < pack.claims[userId]!.choiceSlots)
    .sort((a, b) => b.createdAt - a.createdAt);
  const pack = packages[0];
  if (!pack) throw new Error("NO_PENDING_PRIZE");
  const claim = pack.claims[userId]!;
  const remaining = claim.choiceSlots - claim.chosenRoleIds.length;
  const unique = [...new Map(roles.map((role) => [role.id, role])).values()];
  if (unique.length !== roles.length) throw new Error("DUPLICATE_PRIZE_ROLE");
  if (!unique.length || unique.length > remaining) throw new Error("INVALID_PRIZE_COUNT");
  if (unique.some((role) => !isApprovedAdmirerRole(role))) throw new Error("INVALID_ADMIRER_ROLE");
  const member = await guild.members.fetch(userId);
  if (unique.some((role) => member.roles.cache.has(role.id) || claim.automaticRoleIds.includes(role.id) || claim.chosenRoleIds.includes(role.id))) throw new Error("PRIZE_ROLE_OWNED");
  const awarded: Role[] = [];
  for (const role of unique) {
    if (!role.editable) throw new Error("PRIZE_ROLE_UNMANAGEABLE");
    await member.roles.add(role);
    awarded.push(role);
  }
  const updatedPack: EventPrizePackage = {
    ...pack,
    claims: { ...pack.claims, [userId]: { ...claim, chosenRoleIds: [...claim.chosenRoleIds, ...awarded.map((role) => role.id)] } },
  };
  await updateGuildSettings(guild.id, { eventPrizePackages: { ...(settings.eventPrizePackages ?? {}), [pack.key]: updatedPack } });
  return { package: updatedPack, awarded };
}

export async function pendingPrizeText(guild: Guild, userId: string): Promise<string> {
  const settings = await getGuildSettings(guild.id);
  const pending = Object.values(settings.eventPrizePackages ?? {})
    .filter((pack) => pack.finalizedAt && pack.claims[userId] && pack.claims[userId]!.chosenRoleIds.length < pack.claims[userId]!.choiceSlots)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!pending.length) return "You have no pending Admirer-role choices.";
  return pending.map((pack) => {
    const claim = pack.claims[userId]!;
    return `**${pack.title}** · ${claim.choiceSlots - claim.chosenRoleIds.length} choice${claim.choiceSlots - claim.chosenRoleIds.length === 1 ? "" : "s"} remaining`;
  }).join("\n");
}

export function finalizedPrizeText(pack: EventPrizePackage): string {
  const medals = ["🥇", "🥈", "🥉"];
  return pack.podiumIds.map((userId, index) => {
    const claim = pack.claims[userId];
    const automatic = claim?.automaticRoleIds.length ? claim.automaticRoleIds.map((id) => `<@&${id}>`).join(", ") : "";
    const remaining = claim ? claim.choiceSlots - claim.chosenRoleIds.length : 0;
    const choice = remaining > 0 ? `Use \`/prize choose\` for ${remaining === 2 ? "1–2 Admirer roles" : "1 Admirer role"}.` : "";
    const details = [automatic ? `Awarded ${automatic}.` : "", choice].filter(Boolean).join(" ") || "Champions role awarded.";
    return `${medals[index]} <@${userId}> — ${details}`;
  }).join("\n");
}
