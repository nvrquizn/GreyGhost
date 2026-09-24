import { Events, type Client } from "discord.js";
import { cleanupMemberWishlist } from "./profile-data.js";

export function registerProfileEvents(client: Client): void {
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const rolesChanged =
      oldMember.roles.cache.size !== newMember.roles.cache.size ||
      oldMember.roles.cache.some((role) => !newMember.roles.cache.has(role.id));
    if (!rolesChanged) return;

    await cleanupMemberWishlist(newMember).catch((error) => {
      console.error(`Could not clean wishlist for ${newMember.id}:`, error);
    });
  });
}
