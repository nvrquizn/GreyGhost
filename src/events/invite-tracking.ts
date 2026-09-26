import { Events, type Client, type Guild, type Invite } from "discord.js";
import type { MemberInviteRecord } from "../services/guild-settings.js";

interface CachedInvite {
  code: string;
  uses: number;
  inviterId?: string;
}

interface CachedVanity {
  code: string;
  uses: number;
}

const inviteCache = new Map<string, Map<string, CachedInvite>>();
const vanityCache = new Map<string, CachedVanity>();
const resolutionQueues = new Map<string, Promise<void>>();

function cachedInvite(invite: Invite): CachedInvite {
  return {
    code: invite.code,
    uses: invite.uses ?? 0,
    inviterId: invite.inviter?.id,
  };
}

async function refreshGuildInvites(guild: Guild): Promise<void> {
  const invites = await guild.invites.fetch().catch(() => null);
  if (invites) {
    inviteCache.set(guild.id, new Map(invites.map((invite) => [invite.code, cachedInvite(invite)])));
  }

  const vanity = await guild.fetchVanityData().catch(() => null);
  if (vanity?.code) vanityCache.set(guild.id, { code: vanity.code, uses: vanity.uses });
  else vanityCache.delete(guild.id);
}

async function resolveUsedInviteNow(guild: Guild): Promise<MemberInviteRecord> {
  const previousInvites = inviteCache.get(guild.id) ?? new Map<string, CachedInvite>();
  const currentInvites = await guild.invites.fetch().catch(() => null);
  const currentVanity = await guild.fetchVanityData().catch(() => null);

  let usedInvite: CachedInvite | undefined;
  if (currentInvites) {
    const increases = [...currentInvites.values()]
      .map(cachedInvite)
      .filter((invite) => invite.uses > (previousInvites.get(invite.code)?.uses ?? invite.uses))
      .sort((left, right) => right.uses - left.uses);
    usedInvite = increases[0];
    inviteCache.set(guild.id, new Map(currentInvites.map((invite) => [invite.code, cachedInvite(invite)])));
  }

  const previousVanity = vanityCache.get(guild.id);
  if (currentVanity?.code) {
    vanityCache.set(guild.id, { code: currentVanity.code, uses: currentVanity.uses });
  }

  if (usedInvite) {
    return {
      source: "invite",
      code: usedInvite.code,
      inviterId: usedInvite.inviterId,
      joinedAt: Date.now(),
    };
  }

  if (
    currentVanity?.code
    && previousVanity?.code === currentVanity.code
    && currentVanity.uses > previousVanity.uses
  ) {
    return {
      source: "vanity",
      code: currentVanity.code,
      joinedAt: Date.now(),
    };
  }

  return { source: "unknown", joinedAt: Date.now() };
}

export async function resolveUsedInvite(guild: Guild): Promise<MemberInviteRecord> {
  let result: MemberInviteRecord = { source: "unknown", joinedAt: Date.now() };
  const previous = resolutionQueues.get(guild.id) ?? Promise.resolve();
  const current = previous
    .then(async () => {
      result = await resolveUsedInviteNow(guild);
    })
    .catch((error) => {
      console.error(`Could not resolve the used invite in ${guild.id}:`, error);
    });
  resolutionQueues.set(guild.id, current);
  await current;
  if (resolutionQueues.get(guild.id) === current) resolutionQueues.delete(guild.id);
  return result;
}

export function registerInviteTracking(client: Client): void {
  client.once(Events.ClientReady, (readyClient) => {
    void Promise.all([...readyClient.guilds.cache.values()].map(refreshGuildInvites)).catch((error) => {
      console.error("Could not initialize invite tracking:", error);
    });
  });

  client.on(Events.GuildCreate, (guild) => {
    void refreshGuildInvites(guild).catch((error) => {
      console.error(`Could not cache invites for ${guild.id}:`, error);
    });
  });

  client.on(Events.InviteCreate, (invite) => {
    if (!invite.guild) return;
    const cached = inviteCache.get(invite.guild.id) ?? new Map<string, CachedInvite>();
    cached.set(invite.code, cachedInvite(invite));
    inviteCache.set(invite.guild.id, cached);
  });

  client.on(Events.InviteDelete, (invite) => {
    if (!invite.guild) return;
    inviteCache.get(invite.guild.id)?.delete(invite.code);
  });
}
