import { Events, type Client, type GuildMember, type PartialGuildMember } from "discord.js";
import { hasRequiredModeratorRole } from "../moderation/access.js";
import { restoreRiderDragon, retireRiderDragons } from "./store.js";

async function isDragonrider(member: GuildMember | PartialGuildMember): Promise<boolean> {
  return hasRequiredModeratorRole(member.guild.id, member);
}

export function registerDragonRuntime(client: Client): void {
  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    void (async () => {
      const oldEligible = await isDragonrider(oldMember);
      const newEligible = await isDragonrider(newMember);
      if (oldEligible && !newEligible) {
        await retireRiderDragons(newMember.guild.id, newMember.id);
        return;
      }
      if (!oldEligible && newEligible) {
        await restoreRiderDragon(newMember.guild.id, newMember.id);
      }
    })().catch((error) => {
      console.error(`Could not update dragon status for ${newMember.id}:`, error);
    });
  });

  client.on(Events.GuildMemberRemove, (member) => {
    void retireRiderDragons(member.guild.id, member.id).catch((error) => {
      console.error(`Could not retire dragons for departing member ${member.id}:`, error);
    });
  });
}
