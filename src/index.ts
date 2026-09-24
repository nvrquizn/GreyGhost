import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
} from "discord.js";
import { commandMap } from "./commands/index.js";
import { config } from "./config.js";
import { registerMemberEvents } from "./events/member-events.js";
import { registerSelfRoleInteractions } from "./selfroles/interactions.js";
import { registerSuggestionInteractions } from "./suggestions/interactions.js";
import { registerCollectionInteractions } from "./collections/interactions.js";
import { registerCollectionEvents } from "./collections/events.js";
import { registerProfileEvents } from "./profiles/events.js";
import { registerStatsDashboard } from "./stats/dashboard.js";
import { registerLoreInteractions } from "./directory/interactions.js";
import { registerModmailEvents } from "./modmail/events.js";
import { registerModmailInteractions } from "./modmail/interactions.js";
import { registerQuizInteractions } from "./quizzes/runtime.js";
import { registerPrefixCommands } from "./prefix/handler.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

registerMemberEvents(client);
registerSelfRoleInteractions(client);
registerSuggestionInteractions(client);
registerCollectionInteractions(client);
registerCollectionEvents(client);
registerProfileEvents(client);
registerStatsDashboard(client);
registerLoreInteractions(client);
registerModmailEvents(client);
registerModmailInteractions(client);
registerQuizInteractions(client);
registerPrefixCommands(client);

client.once(Events.ClientReady, (readyClient) => {
  readyClient.user.setActivity("the mists of Dragonstone", {
    type: ActivityType.Watching,
  });

  console.log(`Grey Ghost has awakened as ${readyClient.user.tag}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName);
    if (!command?.autocomplete) return;
    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(`Autocomplete failed: ${interaction.commandName}`, error);
      if (!interaction.responded) await interaction.respond([]);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);

  if (!command) {
    await interaction.reply({
      content: "That command seems to have vanished into the mist.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Command failed: ${interaction.commandName}`, error);

    const response = {
      content: "Grey Ghost lost that command in the fog. Please try again.",
      flags: MessageFlags.Ephemeral,
    } as const;

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

await client.login(config.DISCORD_TOKEN);
