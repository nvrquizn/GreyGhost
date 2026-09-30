import {
  Events,
  MessageFlags,
  type Attachment,
  type ChatInputCommandInteraction,
  type Client,
  type GuildBasedChannel,
  type GuildMember,
  type Message,
  type MessageCreateOptions,
  type MessagePayload,
  type Role,
  type User,
} from "discord.js";
import { commandMap } from "../commands/index.js";
import { MODERATION_COMMAND_NAMES, hasRequiredModeratorRole, moderatorRoleRequirementText } from "../moderation/access.js";
import { reportReliabilityError } from "../reliability/logger.js";

const PREFIX = "?";

interface CommandChoice {
  name: string;
  value: string | number;
}

interface CommandOptionJson {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  options?: CommandOptionJson[];
  choices?: CommandChoice[];
  min_value?: number;
  max_value?: number;
  min_length?: number;
  max_length?: number;
}

interface CommandJson {
  name: string;
  description: string;
  options?: CommandOptionJson[];
  default_member_permissions?: string;
}

class PrefixCommandError extends Error {}

export function tokenizePrefixCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (const character of input.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      else current += character;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (quote) throw new PrefixCommandError("A quotation mark was opened but not closed.");
  if (current) tokens.push(current);
  return tokens;
}

function usage(command: CommandJson, subcommand?: CommandOptionJson): string {
  const options = subcommand?.options ?? command.options ?? [];
  const suffix = options.map((option) => option.required ? `<${option.name}>` : `[${option.name}]`).join(" ");
  return `\`${PREFIX}${command.name}${subcommand ? ` ${subcommand.name}` : ""}${suffix ? ` ${suffix}` : ""}\``;
}

function extractId(raw: string, kind: "user" | "role" | "channel"): string | undefined {
  const pattern = kind === "user" ? /^<@!?(\d+)>$/ : kind === "role" ? /^<@&(\d+)>$/ : /^<#(\d+)>$/;
  return raw.match(pattern)?.[1] ?? (/^\d{15,22}$/.test(raw) ? raw : undefined);
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

async function resolveUser(message: Message<true>, raw: string): Promise<User | undefined> {
  const id = extractId(raw, "user");
  if (id) {
    const member = await message.guild.members.fetch(id).catch(() => null);
    return member?.user ?? message.client.users.fetch(id).catch(() => undefined);
  }
  const wanted = normalized(raw.replace(/^@/, ""));
  return message.guild.members.cache.find((member) =>
    [member.user.username, member.user.tag, member.displayName].some((name) => normalized(name) === wanted),
  )?.user;
}

function resolveRole(message: Message<true>, raw: string): Role | undefined {
  const id = extractId(raw, "role");
  if (id) return message.guild.roles.cache.get(id);
  const wanted = normalized(raw.replace(/^@/, ""));
  return message.guild.roles.cache.find((role) => normalized(role.name) === wanted);
}

function resolveChannel(message: Message<true>, raw: string): GuildBasedChannel | undefined {
  const id = extractId(raw, "channel");
  if (id) return message.guild.channels.cache.get(id);
  const wanted = normalized(raw.replace(/^#/, ""));
  return message.guild.channels.cache.find((channel) => normalized(channel.name) === wanted);
}

function optionValueFromChoice(option: CommandOptionJson, raw: string): string | number {
  if (!option.choices?.length) return raw;
  const choice = option.choices.find((entry) =>
    normalized(String(entry.value)) === normalized(raw) || normalized(entry.name) === normalized(raw),
  );
  if (!choice) throw new PrefixCommandError(`**${raw}** is not a valid choice for \`${option.name}\`.`);
  return choice.value;
}

async function convertOption(message: Message<true>, option: CommandOptionJson, raw: string): Promise<unknown> {
  if (option.type === 3) {
    const value = String(optionValueFromChoice(option, raw));
    if (option.min_length !== undefined && value.length < option.min_length) throw new PrefixCommandError(`\`${option.name}\` must contain at least ${option.min_length} characters.`);
    if (option.max_length !== undefined && value.length > option.max_length) throw new PrefixCommandError(`\`${option.name}\` cannot exceed ${option.max_length} characters.`);
    return value;
  }
  if (option.type === 4 || option.type === 10) {
    const selected = optionValueFromChoice(option, raw);
    const value = Number(selected);
    if (!Number.isFinite(value) || (option.type === 4 && !Number.isInteger(value))) throw new PrefixCommandError(`\`${option.name}\` must be ${option.type === 4 ? "a whole number" : "a number"}.`);
    if (option.min_value !== undefined && value < option.min_value) throw new PrefixCommandError(`\`${option.name}\` cannot be below ${option.min_value}.`);
    if (option.max_value !== undefined && value > option.max_value) throw new PrefixCommandError(`\`${option.name}\` cannot exceed ${option.max_value}.`);
    return value;
  }
  if (option.type === 5) {
    if (["true", "yes", "on", "1"].includes(normalized(raw))) return true;
    if (["false", "no", "off", "0"].includes(normalized(raw))) return false;
    throw new PrefixCommandError(`\`${option.name}\` must be yes or no.`);
  }
  if (option.type === 6) {
    const user = await resolveUser(message, raw);
    if (!user) throw new PrefixCommandError(`I could not find the user **${raw}**.`);
    return user;
  }
  if (option.type === 7) {
    const channel = resolveChannel(message, raw);
    if (!channel) throw new PrefixCommandError(`I could not find the channel **${raw}**.`);
    return channel;
  }
  if (option.type === 8) {
    const role = resolveRole(message, raw);
    if (!role) throw new PrefixCommandError(`I could not find the role **${raw}**.`);
    return role;
  }
  throw new PrefixCommandError(`The option \`${option.name}\` is not supported by message commands.`);
}

export async function parsePrefixOptions(
  message: Message<true>,
  command: CommandJson,
  inputTokens: string[],
): Promise<{ subcommand?: string; values: Map<string, unknown>; syntax: string }> {
  const rootOptions = command.options ?? [];
  const subcommands = rootOptions.filter((option) => option.type === 1);
  let subcommand: CommandOptionJson | undefined;
  const tokens = [...inputTokens];
  if (subcommands.length) {
    subcommand = subcommands.find((option) => normalized(option.name) === normalized(tokens[0] ?? ""));
    if (subcommand) tokens.shift();
    else if (subcommands.length === 1) subcommand = subcommands[0];
    else throw new PrefixCommandError(`Choose a subcommand: ${subcommands.map((option) => `\`${option.name}\``).join(", ")}.`);
  }
  const options = subcommand?.options ?? (subcommands.length ? [] : rootOptions);
  const optionNames = new Set(options.map((option) => option.name));
  const named = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const withoutDashes = token.replace(/^--/, "");
    const separator = withoutDashes.search(/[:=]/);
    const potentialName = separator >= 0 ? withoutDashes.slice(0, separator) : withoutDashes;
    if (separator >= 0 && optionNames.has(potentialName)) {
      named.set(potentialName, withoutDashes.slice(separator + 1));
    } else if (token.startsWith("--") && optionNames.has(potentialName)) {
      const next = tokens[index + 1];
      if (!next) throw new PrefixCommandError(`\`--${potentialName}\` needs a value.`);
      named.set(potentialName, next);
      index += 1;
    } else positional.push(token);
  }

  const values = new Map<string, unknown>();
  const attachments = [...message.attachments.values()];
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]!;
    if (option.type === 11) {
      const attachment = attachments.shift();
      if (attachment) values.set(option.name, attachment);
      else if (option.required) throw new PrefixCommandError(`Attach a file for \`${option.name}\`.`);
      continue;
    }
    let raw = named.get(option.name);
    if (raw === undefined && positional.length) {
      const laterRequired = options.slice(index + 1).filter((entry) =>
        entry.type !== 11 && entry.required && !named.has(entry.name),
      ).length;
      if (!option.required && positional.length <= laterRequired) continue;
      const laterTextOptions = options.slice(index + 1).filter((entry) => entry.type !== 11);
      raw = option.type === 3 && laterTextOptions.length === 0 ? positional.splice(0).join(" ") : positional.shift();
    }
    if (raw === undefined || raw === "") {
      if (option.required) throw new PrefixCommandError(`Missing \`${option.name}\`.`);
      continue;
    }
    values.set(option.name, await convertOption(message, option, raw));
  }
  if (positional.length) throw new PrefixCommandError(`I could not place: **${positional.join(" ")}**. Put text containing spaces in quotation marks.`);
  return { subcommand: subcommand?.name, values, syntax: usage(command, subcommand) };
}

function isEphemeral(payload: unknown): boolean {
  if (!payload || typeof payload === "string") return false;
  const flags = (payload as { flags?: number }).flags ?? 0;
  return (Number(flags) & MessageFlags.Ephemeral) === MessageFlags.Ephemeral;
}

function cleanPayload(payload: unknown): string | MessagePayload | MessageCreateOptions {
  if (typeof payload === "string") return payload;
  const { flags: _flags, withResponse: _withResponse, fetchReply: _fetchReply, ...clean } = payload as Record<string, unknown>;
  return clean as MessageCreateOptions;
}

function prefixInteraction(
  message: Message<true>,
  subcommand: string | undefined,
  values: Map<string, unknown>,
): ChatInputCommandInteraction<"cached"> {
  let deferred = false;
  let replied = false;
  let privateResponse = false;
  let responseMessage: Message | undefined;

  const send = async (payload: unknown, forcePrivate?: boolean): Promise<Message> => {
    const clean = cleanPayload(payload);
    const hasComponents = typeof clean !== "string" && Boolean((clean as { components?: unknown[] }).components?.length);
    const privately = (forcePrivate ?? isEphemeral(payload)) && !hasComponents;
    if (privately) {
      const direct = await message.author.send(clean).catch(() => null);
      if (direct) {
        await message.react("📬").catch(() => undefined);
        return direct;
      }
      return message.reply("I could not DM that private command response. Please enable DMs or use the `/` version instead.");
    }
    return message.reply(clean);
  };

  const interaction = {
    sourceMessage: message,
    client: message.client,
    guild: message.guild,
    guildId: message.guildId,
    channel: message.channel,
    channelId: message.channelId,
    member: message.member as GuildMember,
    memberPermissions: message.member?.permissions ?? null,
    user: message.author,
    createdTimestamp: message.createdTimestamp,
    commandName: message.content.slice(1).trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "",
    inCachedGuild: () => true,
    options: {
      getSubcommand: () => subcommand,
      getString: (name: string, required?: boolean) => getValue<string>(values, name, required),
      getInteger: (name: string, required?: boolean) => getValue<number>(values, name, required),
      getNumber: (name: string, required?: boolean) => getValue<number>(values, name, required),
      getBoolean: (name: string, required?: boolean) => getValue<boolean>(values, name, required),
      getUser: (name: string, required?: boolean) => getValue<User>(values, name, required),
      getMember: (name: string) => {
        const user = values.get(name) as User | undefined;
        return user ? message.guild.members.cache.get(user.id) ?? null : null;
      },
      getRole: (name: string, required?: boolean) => getValue<Role>(values, name, required),
      getChannel: (name: string, required?: boolean) => getValue<GuildBasedChannel>(values, name, required),
      getAttachment: (name: string, required?: boolean) => getValue<Attachment>(values, name, required),
      getMentionable: (name: string, required?: boolean) => getValue<unknown>(values, name, required),
      get: (name: string) => values.has(name) ? { name, value: values.get(name) } : null,
    },
    reply: async (payload: unknown) => {
      privateResponse = isEphemeral(payload);
      responseMessage = await send(payload);
      replied = true;
      return { resource: { message: responseMessage } };
    },
    deferReply: async (options?: unknown) => {
      deferred = true;
      privateResponse = isEphemeral(options);
    },
    editReply: async (payload: unknown) => {
      const clean = cleanPayload(payload);
      if (responseMessage) responseMessage = await responseMessage.edit(clean as Parameters<Message["edit"]>[0]);
      else responseMessage = await send(payload, privateResponse);
      replied = true;
      return responseMessage;
    },
    followUp: async (payload: unknown) => send(payload, isEphemeral(payload) || privateResponse),
    showModal: async () => {
      await message.reply("Discord forms can only be opened with the slash version: `/staffapply`.");
    },
  } as unknown as ChatInputCommandInteraction<"cached">;
  Object.defineProperties(interaction, {
    deferred: { get: () => deferred },
    replied: { get: () => replied },
  });
  return interaction;
}

function getValue<T>(values: Map<string, unknown>, name: string, required = false): T | null {
  const value = values.get(name);
  if (value === undefined && required) throw new PrefixCommandError(`Missing required option \`${name}\`.`);
  return (value as T | undefined) ?? null;
}

export async function handlePrefixMessage(message: Message): Promise<void> {
    if (!message.inGuild() || message.author.bot || !message.content.trimStart().startsWith(PREFIX) || !message.member) return;
    const body = message.content.trimStart().slice(PREFIX.length).trim();
    if (!body) return;
    let tokens: string[];
    try {
      tokens = tokenizePrefixCommand(body);
    } catch (error) {
      await message.reply((error as Error).message);
      return;
    }
    const commandName = tokens.shift()?.toLowerCase();
    if (!commandName) return;
    const command = commandMap.get(commandName);
    if (!command) {
      await message.reply(`I do not recognize \`${PREFIX}${commandName}\`. Use \`${PREFIX}help\` to view your commands.`);
      return;
    }
    const json = command.data.toJSON() as CommandJson;
    if (MODERATION_COMMAND_NAMES.has(commandName)) {
      const allowed = await hasRequiredModeratorRole(message.guildId, message.member);
      if (!allowed) {
        await message.reply(await moderatorRoleRequirementText(message.guildId, message.guild));
        return;
      }
    }
    if (json.default_member_permissions && !message.member.permissions.has(BigInt(json.default_member_permissions))) {
      await message.reply("You do not have permission to use that command.");
      return;
    }
    try {
      const parsed = await parsePrefixOptions(message, json, tokens);
      const interaction = prefixInteraction(message, parsed.subcommand, parsed.values);
      await command.execute(interaction);
    } catch (error) {
      if (error instanceof PrefixCommandError) {
        let selected: CommandOptionJson | undefined;
        const first = tokens[0]?.toLowerCase();
        selected = json.options?.find((option) => option.type === 1 && option.name === first);
        await message.reply(`${error.message}\nUsage: ${usage(json, selected)}`);
        return;
      }
      console.error(`Prefix command failed: ${commandName}`, error);
      void reportReliabilityError(message.client, message.guildId, `Prefix command failed: ?${commandName}`, error, `User: ${message.author.tag} (${message.author.id})\nChannel: <#${message.channelId}>`);
      await message.reply("Grey Ghost lost that command in the fog. Please try again.");
    }
}

export function registerPrefixCommands(client: Client): void {
  client.on(Events.MessageCreate, (message) => {
    void handlePrefixMessage(message).catch((error) => {
      console.error("Prefix command listener failed:", error);
      if (message.guildId) void reportReliabilityError(client, message.guildId, "Prefix command listener failed", error, `User: ${message.author.tag} (${message.author.id})\nChannel: <#${message.channelId}>`);
    });
  });
}
