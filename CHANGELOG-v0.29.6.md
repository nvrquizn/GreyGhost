# Grey Ghost v0.29.6 — Ticket Closure Controls

## Modmail panel
- Closing a ticket now changes its Grey Ghost header controls to **Reopen Ticket** and **Delete Ticket · Dragonrider**.
- Reopening restores the ticket channel name, notifies the member, and restores the normal Claim/Close panel.
- Closed-ticket deletion removes the channel and records the deletion in the modmail log.
- Deleted tickets remain marked as deleted in persistent history and cannot be reopened.

## Dragonseed / Dragonrider access
- Dragonseeds (Trial Moderators) can review and handle modmail tickets, including claiming, replying, closing, and reopening them.
- The `modmail` command is no longer blocked by the Dragonrider-only moderation-command gate; its own ticket-staff access rules are used instead.
- New ticket channels automatically grant access to the configured modmail staff role, the configured Dragonrider moderator role, and a role named `Dragonseed` when present.
- Only Dragonriders (configured moderator role) or server managers may permanently delete a closed ticket.

## Compatibility
- Existing open and closed ticket headers are refreshed on startup so they receive the new controls.
- Existing modmail data remains compatible; ticket records now also support a `deleted` state and deletion metadata.
