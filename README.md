# Grey Ghost

Grey Ghost is a custom all-purpose Discord bot for an ASOIAF community. The
current build supports both slash commands and role-aware `?` prefix commands.

## Current commands and features

- `/ping` — checks whether Grey Ghost is online
- `/help` — shows the available command roster
- `?command` — runs the same command through the optional question-mark prefix
- `?help` — shows only the public and staff commands the invoking member may use
- `/about` — introduces Grey Ghost
- `/remindme set`, `/remindme list`, and `/remindme cancel` — manage up to 20
  persistent personal reminders, from one minute to 365 days
- `/userinfo` — shows a member's account, server dates, roles, boost status, and avatar
- `/serverinfo` — shows the server owner, creation date, member/channel counts,
  roles, emojis, stickers, boosts, and verification level
- `/rolemembers` — privately pages through members who have a selected role
- `/whohas` — privately pages through members who inherit a selected Discord permission
- `/spoiler` — safely posts text behind Discord's spoiler covering
- `/testwelcome` or `?testwelcome` — safely previews the configured welcome message
- `/setup onboarding` — configures the welcome channel, join/leave log, and
  automatic newcomer role
- `/setup view` — displays the current server configuration
- `/setup clear` — disables selected onboarding settings
- `/setup governance` — configures public petitions, private council proposals,
  the council/staff voting role, and the staff-application channel
- `/setup collections` — chooses where newly earned collection titles are announced
- `/setup check` — checks configured channels, permissions, panels, and title roles
- `/setup modmail` — configures the private ticket category, staff role, and transcript log
- `/setup moderation` — chooses the private moderation case-log channel
- `/setup server-logs` — chooses one private channel for message, channel,
  permission, thread, role, member, invite, and ghost-ping activity
- `/setup reaction-logs` — chooses a separate private channel for reaction activity
- `/setup chronicles` — chooses the channel for permanent Realm history and
  immediately publishes the server-founding record
- `/backup create` and `/backup restore` — export or restore server-specific bot data
- `/selfroles configure` — selects up to 25 roles for a self-role panel
- `/selfroles emoji` — assigns an emoji to a configured role button
- `/selfroles publish` — publishes or updates a persistent role panel
- `/selfroles view` and `/selfroles clear` — inspect or reset a panel
- `/embed` — publishes a formatted information embed with an optional banner
- `/petition submit` — posts a public petition with up to four images and persistent voting
- `/petition status` — server-owner-only final review: considering, accepted,
  denied, implemented, or reopened, with an optional response
- `/council propose` — council-role-only proposals and private advisory voting
- `/staffapply` — opens a private five-question staff application form
- `/event create`, `/event status`, `/event complete`, and `/event cancel` —
  event publishing and Going/Interested/Cannot Attend tracking
- `/collection progress` — shows progress toward configured collection titles
- `/collection configure` — configures all-of or X-of-Y automatic title requirements
- `/collection view`, `/collection remove`, and `/collection sync` — manage titles
- `/profile view` — displays a member's Realm profile, roles, collection titles,
  admirer count, wishlist, and server dates
- `/profile edit`, `/profile wishlist`, and `/profile clear` — customize personal
  profile details and desired admirer roles
- `/stats view` — displays current member, allegiance, admirer, title, profile,
  and petition statistics
- `/stats publish` and `/stats refresh` — manage a dashboard that automatically
  refreshes every 15 minutes
- `/housepoints standings` and `/housepoints history` — show the Great Houses'
  current scores and recent point changes
- `/housepoints award` and `/housepoints deduct` — staff-only, audited House
  Point changes with a reason and optional credited member
- `/season status`, `/season history`, `/season start`, and `/season end` — run
  House Point seasons, archive final scores, and record tied winners fairly
- `/housequest list`, `/housequest create`, `/housequest progress`, and
  `/housequest cancel` — track staff-verified House objectives and rewards
- `/chronicle view` and `/chronicle record` — read permanent Realm history or
  add a staff-curated milestone
- `/achievements view`, `/achievements grant`, and `/achievements revoke` —
  display and manage permanent member achievements
- `/lore view`, `/lore search`, and `/lore list` — browse Houses, characters,
  and dragons by name or alias, with autocomplete and private spoiler reveals
- `/directory house`, `/directory character`, and `/directory dragon` — add or
  replace staff-curated directory entries
- `/directory remove` — hide a starter entry or remove a custom entry
- DM Grey Ghost to open a guided, categorized modmail ticket
- `/modmail reply`, `/modmail claim`, `/modmail close`, `/modmail reopen`, and
  `/modmail info` — staff-only ticket management with anonymous member-facing replies
- `/warn`, `/strike`, `/timeout`, `/untimeout`, `/kick`, `/ban`, and `/unban` — permission-gated,
  DM-notified moderation actions with reasons, evidence, and sequential case numbers
- `/moderation history`, `/moderation case`, `/moderation case-edit`,
  `/moderation case-void`, and `/moderation clear-warnings` — inspect and manage records
- `/moderation note-user`, `/moderation note-case`, `/moderation notes-user`,
  `/moderation notes-case`, and `/moderation note-delete` — private staff notes
- `/purge`, `/slowmode`, `/lock`, and `/unlock` — logged channel moderation controls
- `/quiz create`, `/quiz question`, and `/quiz publish` — prepare a live quiz lobby
- `/quiz start`, `/quiz next`, `/quiz close-question`, `/quiz end`, and
  `/quiz cancel` — host a live speed-weighted quiz
- `/quiz status` — privately inspect participants and response totals
- `/joust create`, `/joust publish`, `/joust start`, `/joust next`, and
  `/joust cancel` — host automated House tournaments
- `/joust enter`, `/joust withdraw`, and `/joust status` — manage entries and
  inspect the lists
- Welcomes new members at the gates of King's Landing
- Automatically assigns the configured newcomer role
- Records member joins and departures in a private log channel
- Records message edits/deletions, ghost pings, and channel/thread creation,
  deletion, renaming, settings, and permission changes in the server log while
  keeping reaction activity in its own private log

## Reminders and utility commands

Reminder durations use compact values such as `30m`, `2h`, `7d`, or `4w`.
Grey Ghost posts the reminder in the channel where it was created and falls
back to a DM if that channel is unavailable. Pending reminders survive bot
restarts, are included in server backups, and are limited to 20 per member.

`/rolemembers` lists one selected role, while `/whohas` checks effective Discord
permissions inherited from every role. Both results are private and split into
pages of 20 members. `/spoiler` disables mentions inside the concealed text;
when its `?spoiler` form is used, Grey Ghost removes the visible command message
after posting the covered version, provided it can manage that message.

## Self-role panels

Grey Ghost includes House Allegiance, the Dance, the Blackfyre Rebellion,
religion, factions, and pronoun panels. House, faction, and pronoun panels allow
multiple roles. Dance, Blackfyre, and religion panels keep at most one role at
a time. The Kingdoms panel allows one regional role, while the Ping Roles panel
allows any number of notification roles. Published panels can recover their
configuration from their Discord buttons if the local data file is missing
after an update, so existing role buttons continue working.

## Petitions, council, and staff applications

Petition votes are stored across restarts, allow one vote per member, and can
be switched or removed by pressing the same button again. Owner decisions
recolour the original petition embed; resolved petitions lock voting, while
reopened petitions restore it. Existing suggestion records are retained and
displayed as petitions after updating.

Council proposals are posted only in the configured private council channel.
Members with the configured council role may vote yes or no, but those totals
are advisory: accept and deny buttons work only for the Discord server owner.

`/staffapply` opens a private form covering motivation, experience, availability,
strengths, and additional information. Finished forms are posted and permanently
updated in the configured staff-application channel. Council/staff members may
vote yes or no (applicants cannot vote on themselves), while the final accept or
deny buttons work only for the server owner. The applicant receives a private
decision notice when possible.

## Event manager

Members with **Manage Events** may publish an event using a compact start time
such as `30m`, `2h`, `7d`, or `4w`. Members can switch between Going,
Interested, and Cannot Attend, or remove their response by pressing the selected
button again. Hosts and server managers can privately inspect RSVP lists and
close the buttons by completing or cancelling the event.

## Collections

Collection titles are
granted and removed automatically when member roles change. Title roles can be
used as requirements for milestone titles, allowing chained rewards such as
Lord Paramount and Protector of the Realm. Newly earned titles can be announced
in a configured channel, with chained rewards combined into one announcement.

Backups contain the server's Grey Ghost settings, self-role panels, collection
requirements, member profiles, wishlists, petitions and votes, council proposals,
staff applications and votes, events and RSVPs. They never include the bot
token or `.env` file. Restores are validated and restricted to the Discord
server that created the backup.

Member profile cards automatically reflect configured self roles and Titles of
the Realm. Wishlists hold up to five unowned admirer roles and automatically
remove a role after the member receives it.

The statistics dashboard tracks people and bots, House and Dance allegiances,
popular admirer roles, commonly earned titles, title collectors, saved member
profiles, petition statuses, and live House Point standings. It recreates its
message if the published dashboard is deleted.

House Points can only be assigned to roles configured in the House Allegiance
panel. Every award or deduction records its amount, reason, staff member,
timestamp, and optional credited member. Scores cannot fall below zero, and the
ledger is included in Grey Ghost backups.

## Chronicles, House seasons, quests, and achievements

Configure the publication channel with `/setup chronicles`. Grey Ghost records
the server's founding, completed House-season winners, and jousting champions.
Managers can also preserve other important milestones with `/chronicle record`;
all saved entries remain readable with `/chronicle view` even if the publication
channel is temporarily unavailable.

Starting a House season resets only the active House scores. Ending it archives
the final scores, preserves ties, records the winner in the Chronicles, and
awards **Victor of the Season** to current members of every winning House. The
completed season remains available through `/season history`.

House quests are deliberate, staff-verified objectives in the Lore & Trivia,
Creative Work, Service to the Realm, Recruitment, or Jousting categories. They
do not include generic participation or petition quests. Staff record progress;
completion awards the configured House Points through the existing audited
ledger. An optionally credited member earns **Quest Contributor**.

Other achievements are awarded automatically for winning a first jousting tilt,
winning a jousting tournament, and finishing first in a quiz. The server owner
receives **Founder of the Realm** when the founding Chronicle is established.


## Characters, coin, training, and equipment

Version 0.20.0 adds persistent Realm characters and the first progression/economy layer.
Create a character with `/character create`; character records hold Health, Damage,
and Resistance training, coin, owned gear, and the currently equipped mount/armour.

`/daily claim` awards **2–5 coins** once every 24 hours. `/daily train` raises one
of Health, Damage, or Resistance by one point on its own 24-hour cooldown. Coin
transactions are retained in `/coin history`.

The first equipment catalogue has five mount and armour tiers at **1, 15, 50,
100, and 150 coins**: Worn Courser / Padded Armour, Trained Courser /
Boiled-Leather Armour, Swift War Courser / Mail Hauberk, Battle Destrier /
Plate-and-Mail, and Champion’s Destrier / Castle-Forged Plate. Use `/shop`,
`/buy`, `/inventory`, `/stable`, `/armoury`, and `/loadout` to manage them.

Equipment bonuses, upgrades, injuries, recovery, bandages, ransom/spoils, and
deeper jousting integration remain intentionally reserved for v0.21.0. Economy
data is stored in `data/economy.json` and is included in v2 server backups.

## ASOIAF directory

The starter directory contains Houses, major characters, and dragons relevant
to the server. Public entry cards are spoiler-free. If an entry has additional
spoiler notes, its warning button reveals them ephemerally so only the member
who pressed it can see them.

Server managers can add, replace, or remove entries without editing the source
code. Names and aliases are searchable and appear in command autocomplete.
Custom entries and hidden starter entries are stored with the rest of the
server settings, so they survive restarts and are included in backups.

For `/directory house`, `/directory character`, and `/directory dragon`, format
the optional facts field as `Label: Value | Label: Value`. Image and source
links must use HTTPS.

## Modmail

Members DM Grey Ghost, choose a category, and complete a private subject and
explanation form. Grey Ghost creates a numbered private channel such as
`ticket-0042-member`, prevents duplicate open tickets, and forwards later DMs
and attachments into the same ticket.

Ordinary staff messages typed in a ticket channel are sent through Grey Ghost
without exposing the responding staff member to the ticket author. Prefix a
message with `//` to keep it as a private staff note instead. Claims and staff identities remain visible inside
the private staff channel. Closing a ticket notifies the member, preserves its
saved status, renames the channel, and sends a text transcript to the configured
log channel. Ticket numbers and metadata are included in server backups.

## Local setup

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Add your Discord application ID, test server ID, and bot token to `.env`.
   Keep this file private and never post or commit the token.
5. Run `npm run commands:deploy` once to register the slash commands.
6. Run `npm run dev` to awaken Grey Ghost.

For DM modmail, enable **Message Content Intent** in the Discord Developer
Portal under **Bot → Privileged Gateway Intents**.

## Question-mark prefix commands

Every slash command also accepts the `?` prefix. Subcommands follow the command
name, mentions resolve to their Discord users, roles, or channels, and text
containing spaces may be placed in quotation marks. For example:

```text
?profile view @member
?remindme set 2h "Check the event sign-ups"
?petition submit "Add an ASOIAF reread night"
?council propose "New event format" "Use House teams for the next event"
?event create "House Trivia" 2d "A live team trivia night"
?userinfo @member
?whohas manage-events
?spoiler "A concealed message"
?housepoints standings
?warn @member "Repeatedly posting scam links"
?joust enter 3 destrier @House-Targaryen 1 1 0
```

Named options are also accepted as `name:value` or `--name value`, which is
useful for commands containing several text fields. File options use attachments
added to the invoking message. Responses that would be ephemeral when using a
slash command are delivered through DM; Grey Ghost reacts with 📬 after delivery.

Prefix commands enforce the same Discord permission and role-hierarchy checks
as slash commands. `/help` and `?help` share one role-aware catalogue, hiding
configuration and moderation commands from members who cannot use them.

## Server audit logs

Configure the main destination with `/setup server-logs` and keep high-volume
reaction activity separate with `/setup reaction-logs`. Grey Ghost records
message edits and deletions, bulk deletions, channel/category/thread
creation and deletion, renames, category moves, topics, slowmode, voice limits,
thread archive/lock state, role creation/deletion/renaming, and permission changes. Permission entries
name every affected Discord permission and show whether it became allowed,
denied, or reset.

Invite usage is cached while Grey Ghost is online. Join logs show the member,
account creation and join times, member count, invite code, inviter, and avatar.
The attribution is saved so leave logs can repeat the original invite and
inviter alongside time spent in the server and roles held at departure. Discord
occasionally removes or withholds an invite before it can be matched; those
rare joins are marked as unknown instead of being guessed.

If a message directly mentioning a member is deleted within 30 seconds, the log
marks it as a ghost ping and Grey Ghost privately notifies each directly
mentioned member. Bot-authored events are ignored. Grant Grey Ghost **View Audit
Log** if staff should see who performed channel, category, thread, or permission
changes; logging still works without that permission, but the actor is shown as
unavailable.

## Moderation cases

Configure moderation with `/setup moderation`. Every warning, timeout change,
kick, ban, and unban receives a sequential case number and is saved in the
server backup. Members receive a private notice containing the action, case
number, reason, duration when relevant, and directions to use modmail for an
appeal. The moderation log records the responsible staff member, whether the DM
was delivered, and any supplied evidence.

Commands enforce Discord permissions and role hierarchy for both the acting
staff member and Grey Ghost. Timeout durations use compact values such as
`30m`, `2h`, `7d`, or `4w`, with Discord's 28-day maximum enforced.

Warnings and strikes have active totals in member history. Escalation remains a
staff decision rather than an automatic punishment. Cases can be corrected or
voided without erasing their audit trail. Private notes may be attached either
to a user generally or to one case; each records its author and timestamp and
is never included in a member-facing DM. Only members with **Manage Server** may
permanently delete a note.

## Live quizzes

Quiz hosts create a draft, add two-to-four-choice questions, and publish a Join
Quiz lobby. During each question, members answer through emoji-labelled buttons;
Discord does not reveal who selected an answer or how many selected each option.
Players may privately change their answer until the timer expires.

Correct answers earn three points in the first third of the timer, two in the
middle third, and one in the final third. Grey Ghost automatically closes each
question, reveals the correct answer and optional explanation, and updates the
leaderboard. The host controls when the next question begins and when final
standings are published. Active timers recover after a bot restart, and quiz
drafts, participants, responses, and scores are included in backups.

## Jousting tournaments

Hosts create and publish a lobby, while members enter with a destrier or courser,
a configured House Allegiance role, and a Health/Damage/Resistance build. The
three stats must total two; individual stats may range from -3 to 8 so riders
can deliberately weaken one attribute to strengthen another. Destriers are
sturdier, while coursers strike harder.

When the lists close, Grey Ghost preserves each rider's House choice unless
everyone selected the same House; in that case it randomly spreads entrants
across configured House roles. It never pairs two riders of the same House. Each tilt eliminates
the losing rider, and every victory atomically awards two points to the winner's
House in the existing audited House Point ledger. If only riders of one House
remain, they share the tournament victory rather than tilting one another.

Round announcements, `/joust status`, and the final results display the top
three riders ranked by total tilts won. Equal win totals are ordered by how far
the rider survived in the tournament.

Joust drafts, entrants, assigned Houses, stats, match history, and champions are
stored in server settings and included in backups.

After updating commands, run `npm run commands:deploy` again and restart the bot.

## Planned modules

1. Welcome, verification, and role menus
2. Moderation tools and staff logs
3. Events, QOTD, polls, and suggestions
4. ASOIAF profiles, house allegiance, points, and community games
5. Per-server configuration and an optional dashboard

## Project structure

```text
src/
  commands/          Individual slash commands
  types/             Shared TypeScript contracts
  config.ts          Private environment validation
  deploy-commands.ts Registers commands with Discord
  index.ts           Starts the bot and handles interactions
```

## v0.21.0 progression notes

Staff can use `/grant coins` and `/grant item` to award members without spending from their own balance. Members still use `/buy` when they are purchasing items with their own coins.

Joust losers now have a chance to receive a temporary injury. Field Bandages can be bought or granted, then consumed with `/recovery bandage`.

## v0.22.0 — Spoils, ransoms & grand melees

Competitive jousts may now create rights of spoils, including capped coin claims and ransomable non-starter equipment. Grand melees add horse-free last-fighter-standing tournaments driven by character training and equipped armour. Use `/spoils` and `/melee` to access the new systems.


## v0.23.0 — Expeditions

Expeditions are multi-stage cooperative adventures. Hosts open a party with `/expedition create`, members join before departure, then vote on bold, cautious, or clever approaches at each stage. Party size, trained character stats, equipped mounts and armour, supplies, prior choices, difficulty, and a controlled random roll all affect outcomes.

Successful journeys award coins and the **Expedition Veteran** achievement. Flawless expeditions also award one expedition cosmetic per explorer. Strong expeditions are recorded in the Chronicles, and participating members can automatically advance an active **Service to the Realm** House quest for their configured House. Failed stages may cause only temporary bruised or wounded injuries; expeditions never delete characters or cause permanent catastrophe. Expedition party progress is maintained in a live plain-text channel message, with party pings when stages open or the journey returns.

Commands: `/expedition create`, `/expedition join`, `/expedition leave`, `/expedition choose`, `/expedition status`, and `/expedition continue`.


## v0.24.0 — Dragonriders, Trading & Live Expeditions

Grey Ghost now maintains a permanent Dragon Registry for the moderator team. Dragons grow through real time and daily feeding, unlock training, flights, patrols and hunts as they mature, develop a rider bond, receive a stable daily mood, collect dragon-specific achievements, record encounters and official event appearances, and retain their complete history. When a member ceases to be a Dragonrider, their dragon becomes permanently wild: it remains visible in the registry and can never be claimed by another rider.

Members with Realm characters can also open confirmation-based trades for eligible inventory items and coin. Both offers must be confirmed unchanged before the exchange completes; changing either side clears confirmations.

Expeditions now keep a live text status in-channel showing the party and choice progress, and automatically ping party members when a stage opens or the expedition returns.


## v0.24.2 — Dragonrider Access & Growth Controls

- Configure the role required for moderation commands and dragon creation with `/setup moderator-role`.
- Moderation commands now require the configured moderator role in addition to their normal Discord permissions.
- Dragonriders may create one dragon per person; retired dragons return to their original rider if that rider rejoins the moderator role.
- Server managers can add manual growth days with `/dragon growth`, advancing both age and feeding growth progress.
- Retired dragons remain historical records and cannot be reassigned to another rider.
