# Crew requirements

1. The crew builds one valid show playlist per day from a family inbox, a music library, a story list and the caregiver reminders.
2. Every show validates against schema/show-playlist.schema.json before it is published.
3. Every run writes an event log that validates against schema/crew-events.schema.json.
4. Demo mode needs no credentials and gives the same output for the same date.
5. Live adapters (Telegram, Polly, Bedrock, depth estimation) switch on only when their environment variables exist.
6. A note about medicine goes from the Archivist straight to the Care Checker and is blocked there.
7. A voice message with a photo goes through all five agents and airs as a voice message.
8. Reminder text airs exactly as the caregiver wrote it.
9. If a stage throws, the previous published show stays in place and the run exits with a failure.
10. Running the crew costs nothing until real adapters are switched on.
