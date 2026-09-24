# Grey Ghost

Grey Ghost is a custom all-purpose Discord bot for an ASOIAF community. The
current build supports both slash commands and role-aware `?` prefix commands.

## Current commands and features

- `/ping` — checks whether Grey Ghost is online
- `/help` — shows the available command roster
- `?command` — runs the same command through the optional question-mark prefix
- `?help` — shows only the public and staff commands the invoking member may use
- `/about` — introduces Grey Ghost
- `/testwelcome` or `?testwelcome` — safely previews the configured welcome message
- `/setup onboarding` — configures the welcome channel, join/leave log, and
  automatic newcomer role
- `/setup view` — displays the current server configuration
- `/setup clear` — disables selected onboarding settings
- `/setup suggestions` — chooses where `/suggest` submissions are posted
- `/setup collections` — chooses where newly earned collection titles are announced
- `/setup check` — checks configured channels, permissions, panels, and title roles
- `/setup modmail` — configures the private ticket category, staff role, and transcript log
- `/setup moderation` — chooses the private moderation case-log channel
- `/backup create` and `/backup restore` — export or restore server-specific bot data
- `/selfroles configure` — selects up to 25 roles for a self-role panel
- `/selfroles emoji` — assigns an emoji to a configured role button
- `/selfroles publish` — publishes or updates a persistent role panel
- `/selfroles view` and `/selfroles clear` — inspect or reset a panel
- `/embed` — publishes a formatted information embed with an optional banner
- `/suggest` — posts a suggestion with up to four images and persistent voting
- `/suggestion status` — marks suggestions as considering, accepted, denied,
  implemented, or reopened, with an optional staff response
- `/collection progress` — shows progress toward configured collection titles
- `/collection configure` — configures all-of or X-of-Y automatic title requirements
- `/collection view`, `/collection remove`, and `/collection sync` — manage titles
- `/profile view` — displays a member's Realm profile, roles, collection titles,
  admirer count, wishlist, and server dates
- `/profile edit`, `/profile wishlist`, and `/profile clear` — customize personal
  profile details and desired admirer roles
- `/stats view` — displays current member, allegiance, admirer, title, profile,
  and suggestion statistics
- `/stats publish` and `/stats refresh` — manage a dashboard that automatically
  refreshes every 15 minutes
- `/housepoints standings` and `/housepoints history` — show the Great Houses'
  current scores and recent point changes
- `/housepoints award` and `/housepoints deduct` — staff-only, audited House
  Point changes with a reason and optional credited member
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

## Self-role panels

Grey Ghost includes House Allegiance, the Dance, the Blackfyre Rebellion,
religion, factions, and pronoun panels. House, faction, and pronoun panels allow
multiple roles. Dance, Blackfyre, and religion panels keep at most one role at
a time. The Kingdoms panel allows one regional role, while the Ping Roles panel
allows any number of notification roles. Published panels can recover their
configuration from their Discord buttons if the local data file is missing
after an update, so existing role buttons continue working.

## Suggestions and collections

Suggestion votes are stored across restarts, allow one vote per member, and can
be switched or removed by pressing the same button again. Staff decisions
recolour the original suggestion embed; resolved suggestions lock voting, while
reopened suggestions restore it. Collection titles are
granted and removed automatically when member roles change. Title roles can be
used as requirements for milestone titles, allowing chained rewards such as
Lord Paramount and Protector of the Realm. Newly earned titles can be announced
in a configured channel, with chained rewards combined into one announcement.

Backups contain the server's Grey Ghost settings, self-role panels, collection
requirements, member profiles, wishlists, suggestions, and suggestion votes. They never include the bot
token or `.env` file. Restores are validated and restricted to the Discord
server that created the backup.

Member profile cards automatically reflect configured self roles and Titles of
the Realm. Wishlists hold up to five unowned admirer roles and automatically
remove a role after the member receives it.

The statistics dashboard tracks people and bots, House and Dance allegiances,
popular admirer roles, commonly earned titles, title collectors, saved member
profiles, suggestion statuses, and live House Point standings. It recreates its
message if the published dashboard is deleted.

House Points can only be assigned to roles configured in the House Allegiance
panel. Every award or deduction records its amount, reason, staff member,
timestamp, and optional credited member. Scores cannot fall below zero, and the
ledger is included in Grey Ghost backups.

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
