---
inclusion: always
---

# Safety steering

The listener is a person with memory loss. Rose, born 1946, is fictional in this repository.

- Only the caregiver writes care instructions. Family notes that mention medicine, doses, doctors or health care are blocked.
- Caregiver reminders are copied word for word by the Producer. The Care Checker compares them after Unicode NFC normalization and restores them if they differ.
- The Scriptwriter never receives reminder text and never claims personal memories.
- Never quiz the listener about memories. Replace any such line with a neutral one.
- Host lines stay at two sentences or thirty words at most.
- Topics in avoidTopics are never aired.
- Voices of family members are recordings made by them. Cloning a voice is impossible by schema: voice messages only accept a recorded file, and only host, story and reminder lines may use computer speech.
- A second reader (language model) may only add findings. It can never unblock a line.
- If any stage fails, keep yesterday's published show.
