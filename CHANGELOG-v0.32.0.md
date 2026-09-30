# Grey Ghost v0.32.0 — Reliability & Automatic Recovery

- Added `/setup reliability-logs channel:#channel`.
- Command and autocomplete failures can be reported to a private reliability channel with stack/context information.
- Discord client errors and unhandled promise rejections are reported when a reliability channel is configured.
- Deleted sticky messages are automatically rebuilt.
- Missing statistics dashboard pages are automatically rebuilt.
- Deleted self-role panels are automatically republished and their stored message IDs repaired.
- Deleted Realm event RSVP panels are automatically republished and their stored message IDs repaired.
- Persistent-message recovery also runs after Grey Ghost starts, repairing missing stored panels after downtime.
- Intentional sticky/dashboard deletions are suppressed so recovery does not fight normal bot updates.
- `/setup view`, `/setup clear`, and `/setup check` include reliability logs.
