import { Events, type Client, type GuildMember, type PartialGuildMember } from "discord.js";
import { retireRiderDragons } from "./store.js";

function hasDragonriderRole(member: GuildMember | PartialGuildMember): boolean {
  return member.roles.cache.some((role) => role.name.toLowerCase() === "dragonrider");
}

export function registerDragonRuntime(client: Client): void {
  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    if (hasDragonriderRole(oldMember) && !hasDragonriderRole(newMember)) {
      void retireRiderDragons(newMember.guild.id, newMember.id).catch((error) => {
        console.error(`Could not retire dragons for ${newMember.id}:`, error);
      });
    }
  });

  client.on(Events.GuildMemberRemove, (member) => {
    void retireRiderDragons(member.guild.id, member.id).catch((error) => {
      console.error(`Could not retire dragons for departing member ${member.id}:`, error);
    });
  });
}
