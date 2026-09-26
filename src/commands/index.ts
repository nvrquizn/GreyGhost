import type { Command } from "../types/command.js";
import { aboutCommand } from "./about.js";
import { helpCommand } from "./help.js";
import { pingCommand } from "./ping.js";
import { setupCommand } from "./setup.js";
import { selfRolesCommand } from "./selfroles.js";
import { embedCommand } from "./embed.js";
import { collectionCommand } from "./collection.js";
import { backupCommand } from "./backup.js";
import { profileCommand } from "./profile.js";
import { statsCommand } from "./stats.js";
import { housePointsCommand } from "./housepoints.js";
import { loreCommand } from "./lore.js";
import { directoryCommand } from "./directory.js";
import { modmailCommand } from "./modmail.js";
import {
  banCommand,
  kickCommand,
  timeoutCommand,
  strikeCommand,
  unbanCommand,
  untimeoutCommand,
  warnCommand,
} from "./moderation-actions.js";
import { moderationCommand } from "./moderation.js";
import { lockCommand, purgeCommand, slowmodeCommand, unlockCommand } from "./channel-moderation.js";
import { quizCommand } from "./quiz.js";
import { joustCommand } from "./joust.js";
import { testWelcomeCommand } from "./testwelcome.js";
import { remindMeCommand } from "./remindme.js";
import {
  roleMembersCommand,
  serverInfoCommand,
  userInfoCommand,
  whoHasCommand,
} from "./information.js";
import { spoilerCommand } from "./spoiler.js";
import { petitionCommand } from "./petition.js";
import { councilCommand } from "./council.js";
import { staffApplyCommand } from "./staffapply.js";
import { eventCommand } from "./event.js";

export const commands: Command[] = [
  pingCommand,
  helpCommand,
  aboutCommand,
  setupCommand,
  selfRolesCommand,
  embedCommand,
  collectionCommand,
  backupCommand,
  profileCommand,
  statsCommand,
  housePointsCommand,
  loreCommand,
  directoryCommand,
  modmailCommand,
  warnCommand,
  strikeCommand,
  timeoutCommand,
  untimeoutCommand,
  kickCommand,
  banCommand,
  unbanCommand,
  moderationCommand,
  purgeCommand,
  slowmodeCommand,
  lockCommand,
  unlockCommand,
  quizCommand,
  joustCommand,
  testWelcomeCommand,
  remindMeCommand,
  userInfoCommand,
  serverInfoCommand,
  roleMembersCommand,
  whoHasCommand,
  spoilerCommand,
  petitionCommand,
  councilCommand,
  staffApplyCommand,
  eventCommand,
];

export const commandMap = new Map(
  commands.map((command) => [command.data.name, command]),
);
