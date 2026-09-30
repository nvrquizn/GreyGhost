# Grey Ghost v0.31.0 — Levels & Message XP

## Added
- Persistent server XP and levels from normal member messages.
- `/level view`, `/level leaderboard`, `/level give`, `/level take`, `/level reset`.
- `/level exclude-role`, `/level include-role`, and `/level excluded` for roles that should not earn XP.
- `/level role-set`, `/level role-clear`, and `/level sync` for level reward roles.
- Automatic support for roles named `Level 1+`, `Level 5+`, `Level 10+`, `Level 25+`, `Level 50+`, `Level 75+`, and `Level 100+` when no custom role is configured.
- Profile level/XP display.
- Backup format v9 now includes level data and configuration.

## XP behavior
- Ordinary messages receive a base XP award.
- Longer meaningful text gains a small capped bonus; even very long messages cannot receive more than 18 XP from one message.
- Emoji-only and media-only messages still earn XP, but less than normal text messages.
- Rapid posting progressively reduces XP instead of using a hard message cooldown.
- Repeating the same message within the recent anti-spam window sharply reduces XP.
- Bot and webhook messages never earn XP.
- Members holding any XP-excluded role do not earn message XP.

## Level curve
Total XP required for a level is `50 × level × (level + 1)`.
