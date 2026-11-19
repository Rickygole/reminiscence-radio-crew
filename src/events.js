export const AGENTS = [
  { id: 'archivist', name: 'Archivist', job: 'Sorts the inbox, pairs voices with photos, holds back risky notes' },
  { id: 'music_director', name: 'Music Director', job: 'Picks songs from the teenage years, never repeating one' },
  { id: 'scriptwriter', name: 'Scriptwriter', job: 'Writes short warm host lines and an on this day story' },
  { id: 'care_checker', name: 'Care Checker', job: 'Blocks medical talk and keeps caregiver reminders word for word' },
  { id: 'producer', name: 'Producer', job: 'Orders the show, prepares the audio and publishes it' }
]

export const demoClock = (stepMs = 700) => {
  let n = 0
  return { elapsed: () => (n++) * stepMs }
}

export const realClock = () => {
  const t0 = Date.now()
  return { elapsed: () => Date.now() - t0 }
}

export const createLog = (clock) => {
  const events = []
  const emit = (agent, type, message, extra = {}) => {
    const event = { seq: events.length + 1, t: clock.elapsed(), agent, type, message: String(message).slice(0, 140) }
    if (extra.to) event.to = extra.to
    if (extra.itemIds) event.itemIds = [...extra.itemIds]
    events.push(event)
    return event
  }
  return { emit, events }
}
