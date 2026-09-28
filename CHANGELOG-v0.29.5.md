# Grey Ghost v0.29.5

## Profile-picture update logging

- Grey Ghost now logs Discord profile-picture changes to the configured server log channel.
- Global avatar changes are recorded for each mutual server that has server logging configured.
- Server-specific profile-picture changes are logged separately.
- Logs show the member, user ID, previous picture, and new picture, with both images displayed in the embed when Discord can resolve them.

- Build fix: profile-picture logging now accepts Discord.js partial user/member update payloads, resolving TypeScript errors under `npm run check`.
