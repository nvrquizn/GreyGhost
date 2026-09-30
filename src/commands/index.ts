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
  softbanCommand,
  kickCommand,
  timeoutCommand,
  strikeCommand,
  unbanCommand,
  untimeoutCommand,
  warnCommand,
} from "./moderation-actions.js";
import { moderationCommand } from "./moderation.js";
import { caseCommand, modlogsCommand, noteCommand, notesCommand, warningsCommand } from "./moderation-records.js";
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
import { chronicleCommand } from "./chronicle.js";
import { achievementsCommand } from "./achievements.js";
import { seasonCommand } from "./season.js";
import { houseQuestCommand } from "./housequest.js";
import { characterCommand } from "./character.js";
import { dailyCommand } from "./daily.js";
import { coinCommand } from "./coin.js";
import { shopCommand } from "./shop.js";
import { buyCommand } from "./buy.js";
import { inventoryCommand } from "./inventory.js";
import { stableCommand } from "./stable.js";
import { armouryCommand } from "./armoury.js";
import { loadoutCommand } from "./loadout.js";
import { grantCommand } from "./grant.js";
import { recoveryCommand } from "./recovery.js";
import { spoilsCommand } from "./spoils.js";
import { meleeCommand } from "./melee.js";
import { expeditionCommand } from "./expedition.js";
import { dragonCommand } from "./dragon.js";
import { tradeCommand } from "./trade.js";
import { duelCommand } from "./duel.js";
import { renownCommand } from "./renown.js";
import { heirloomCommand } from "./heirloom.js";
import { prizeCommand } from "./prize.js";
import { raceCommand } from "./race.js";
import { huntCommand } from "./hunt.js";
import { tavernCommand } from "./tavern.js";
import { festivalCommand } from "./festival.js";
import { houseChronicleCommand } from "./housechronicle.js";
import { cooldownsCommand } from "./cooldowns.js";
import { stickyCommand } from "./sticky.js";

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
  softbanCommand,
  unbanCommand,
  warningsCommand,
  caseCommand,
  modlogsCommand,
  noteCommand,
  notesCommand,
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
  chronicleCommand,
  achievementsCommand,
  seasonCommand,
  houseQuestCommand,
  characterCommand,
  dailyCommand,
  coinCommand,
  shopCommand,
  buyCommand,
  inventoryCommand,
  stableCommand,
  armouryCommand,
  loadoutCommand,
  grantCommand,
  recoveryCommand,
  spoilsCommand,
  meleeCommand,
  expeditionCommand,
  dragonCommand,
  tradeCommand,
  duelCommand,
  renownCommand,
  heirloomCommand,
  prizeCommand,
  raceCommand,
  huntCommand,
  tavernCommand,
  festivalCommand,
  houseChronicleCommand,
  cooldownsCommand,
  stickyCommand,
];

export const commandMap = new Map(
  commands.map((command) => [command.data.name, command]),
);
