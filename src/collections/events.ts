import { Events, type Client } from "discord.js";
import { evaluateMemberCollections } from "./evaluator.js";

export function registerCollectionEvents(client: Client): void {
  client.on(Events.GuildMemberAdd, async (member) => {
    await evaluateMemberCollections(member, { announce: true }).catch((error) => {
      console.error(`Could not evaluate collections for ${member.id}:`, error);
    });
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const oldRoles = [...oldMember.roles.cache.keys()].sort().join(",");
    const newRoles = [...newMember.roles.cache.keys()].sort().join(",");
    if (oldRoles === newRoles) return;

    await evaluateMemberCollections(newMember, { announce: true }).catch((error) => {
      console.error(`Could not evaluate collections for ${newMember.id}:`, error);
    });
  });
}
