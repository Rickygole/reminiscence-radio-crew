# Reminiscence Radio Crew

Five small agents that build the daily show for [Reminiscence Radio](https://github.com/Rickygole/reminiscence-radio), a tabletop radio for a person with memory loss. The listener in this repository, Rose (born 1946), is fictional.

| Agent | Job |
| --- | --- |
| Archivist | Sorts the family inbox, pairs a voice message with the sender's latest photo, holds risky notes back |
| Music Director | Picks two songs from the listener's teenage years, never repeating one |
| Scriptwriter | Writes short host lines from templates and picks an on this day story |
| Care Checker | Blocks medical talk, fixes memory quizzes and long lines, keeps reminders word for word |
| Producer | Orders the show, prepares audio, validates and publishes it |

Each stage is a pure async function `(input, ctx) => output`. A note about pills goes Archivist to Care Checker and stops there. A voice message from Leo goes through all five agents.

## Run it

Node 22 or newer. ffmpeg is only needed to convert Telegram voice notes (Ogg Opus) to mp3.

```
npm install
npm test
node bin/crew.js run --demo --date 2026-12-04 --out ../reminiscence-radio/public/demo
```

Demo mode needs no credentials and is deterministic: the same date gives byte-identical output. It writes `show.json`, `events.json` and `media/` into the output folder. Stage outputs are also saved under `runs/<date>/`.

Other commands:

```
node bin/crew.js stage care_checker --date 2026-12-04
node bin/crew.js ingest
node bin/crew.js run --date 2026-12-05 --out public
```

## Live adapters

Each adapter has an `available()` check and the crew falls back when it is off.

| Adapter | Switches on with | Fallback |
| --- | --- | --- |
| Telegram | `TELEGRAM_BOT_TOKEN`, `FAMILY_ALLOWLIST` (comma separated user ids) | demo inbox fixtures |
| Polly | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, optional `POLLY_VOICE` (default Matthew, neural) | `{ "speak": true }`, the browser reads the line aloud |
| Language model reviewer | AWS variables plus `LLM_MODEL_ID` (Bedrock) | rules only |
| Depth | `DEPTH=1` | no depth map, the radio uses a gentle zoom |

The AWS packages are optional dependencies and install with `npm ci`. Depth needs `npm install --no-save @huggingface/transformers`.

Telegram rules: direct messages only, senders must be on the allowlist, and only the caregiver can use `/remind HH:MM text`.

## Contract

The radio and the crew share two files and nothing else: `schema/show-playlist.schema.json` and `schema/crew-events.schema.json`. The radio keeps byte-identical copies in `contract/`, and `test/contract.test.js` checks that when the radio repo sits next to this one.

## Kiro Crew

`app.json` and `agents/*.json` wrap each stage as a Kiro Crew agent that runs `node bin/crew.js stage <name>`. The 5 AM cron is registered but disabled. GitHub Actions is the always-on heartbeat: `ingest.yml` every 30 minutes, `nightly.yml` at 10:00 UTC (5 AM Eastern), `test.yml` on push, `pages.yml` publishes `public/`.

## Known limits

- The Care Checker is deterministic. It misses paraphrases and over-blocks health words on purpose.
- Voice recordings are not transcribed, so only the sender, caption and photo alt text are checked.
- On this day stories are marked `verified: false` until a person checks them against their primary source.
- Live mode stores family files and Telegram ids in the repository. Run it only from a private fork.
- `ingest.yml` and `nightly.yml` run only when the repository variable `LIVE_MODE` is `true`. It is unset in this public repository, so only the demo runs here. Set it in a private fork, with the Telegram and AWS secrets, to go live.
