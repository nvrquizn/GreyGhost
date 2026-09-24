import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
const commandData = commands.map((command) => command.data.toJSON());

console.log(`Registering ${commandData.length} Grey Ghost commands…`);

await rest.put(Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID), {
  body: commandData,
});

console.log("Grey Ghost's commands are registered in the test server.");
