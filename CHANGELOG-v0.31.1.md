# Grey Ghost v0.31.1 — Level Announcements, Owner-Only Modmail & Staff Applications

## Level-up announcement channel
- Added `/setup level-up-channel channel:#channel`.
- Level-up messages are posted to the configured channel instead of the channel where XP was earned.
- `/setup view`, `/setup clear`, and `/setup check` recognize the level-up channel.

## Owner-only modmail
- Added `/setup owner-role role:@role`.
- After choosing a modmail category, members choose **Staff Ticket** or **Owner Only**.
- Owner-only tickets are visible only to the configured owner role, the server owner, and Grey Ghost.
- Normal moderators and trial moderators cannot access owner-only ticket controls unless they also have the configured owner role.
- Ticket records display whether visibility is Staff or Owner Only.

## Expanded staff applications
- `/staffapply` is now a three-part application with 15 questions.
- Added timezone, age confirmation, availability, moderation scenarios, inclusivity, impartiality, escalation judgment, motivation, strengths, and optional additional information.
- Application drafts expire after one hour of inactivity.
- Submitted applications are displayed across two embeds for readability while preserving staff voting and owner accept/deny controls.
