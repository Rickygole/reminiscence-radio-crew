const dayOfYear = (monthDay) => {
  const [m, d] = monthDay.split('-').map(Number)
  return Math.floor(Date.UTC(2001, m - 1, d) / 86400000)
}

export const pickStory = (stories, date) => {
  const target = dayOfYear(date.slice(5))
  const dist = (s) => {
    const diff = Math.abs(dayOfYear(s.monthDay) - target)
    return Math.min(diff, 365 - diff)
  }
  return [...stories].sort((a, b) => dist(a) - dist(b) || a.id.localeCompare(b.id))[0]
}

const speak = { speak: true }

export const scriptwriter = async ({ voices, notes, songs, stories, reminders, profile, date, passIds }, ctx) => {
  const { emit } = ctx
  emit('scriptwriter', 'start', 'Drafting short warm lines from the template')
  const name = profile.name
  const segments = []

  const lead = voices[0]
  segments.push({
    id: 'greeting',
    kind: 'host',
    text: lead
      ? `Good morning, ${name}. Your ${lead.sender.relation} ${lead.sender.name} sent you something.`
      : `Good morning, ${name}. Here is your show for today.`,
    audio: speak,
    sourceItemIds: lead ? [lead.voice.id, lead.photo?.id].filter(Boolean) : []
  })

  voices.forEach(({ voice, photo, sender }, i) => {
    const seg = {
      id: `voice-${i + 1}`,
      kind: 'voice_message',
      from: { name: sender.name, relation: sender.relation },
      caption: `A message from ${sender.name}, your ${sender.relation}`,
      performedByVolunteer: voice.volunteer === true,
      audio: { src: voice.file, durationMs: voice.durationMs },
      sourceItemIds: [voice.id, photo?.id].filter(Boolean)
    }
    if (photo) seg.photo = { src: photo.file, alt: photo.alt || `A photo from ${sender.name}` }
    segments.push(seg)
  })

  notes.forEach(({ item, sender }, i) => {
    segments.push({
      id: `note-${i + 1}`,
      kind: 'host',
      text: `${sender.name} wanted you to know: ${item.text.trim()}`,
      audio: speak,
      sourceItemIds: [item.id]
    })
  })

  const song = (s, i) => ({
    id: `song-${i + 1}`,
    kind: 'song',
    title: s.title,
    era: s.era,
    credit: { author: 'Reminiscence Radio team', license: 'CC0-1.0', source: 'src/radio/song-synth.js' },
    audio: { synth: { recipe: s.recipe, seed: s.seed, bpm: s.bpm, key: s.key, seconds: s.seconds } },
    sourceItemIds: []
  })
  if (songs[0]) segments.push(song(songs[0], 0))

  if (reminders.length) {
    segments.push({ id: 'caregiver-intro', kind: 'host', text: 'Here is a note from your caregiver.', audio: speak, sourceItemIds: reminders.map((r) => r.id) })
    for (const r of reminders) {
      segments.push({
        id: `reminder-${r.id}`,
        kind: 'reminder',
        reminderId: r.id,
        time: r.time,
        author: 'caregiver',
        audio: speak,
        sourceItemIds: [r.id]
      })
    }
  }

  const story = pickStory(stories, date)
  if (story) {
    segments.push({
      id: 'story',
      kind: 'story',
      text: `On this day in ${story.year}: ${story.text}`,
      year: story.year,
      sourceUrl: story.sourceUrl,
      audio: speak,
      sourceItemIds: [story.id]
    })
  }

  songs.slice(1).forEach((s, i) => segments.push(song(s, i + 1)))
  segments.push({ id: 'goodbye', kind: 'host', text: `That is all for now, ${name}. Have a lovely day.`, audio: speak, sourceItemIds: [] })

  emit('scriptwriter', 'work', `Drafted ${segments.length} segments`)
  emit('scriptwriter', 'handoff', 'Draft show goes to the Care Checker', { to: 'care_checker', itemIds: passIds })
  emit('scriptwriter', 'done', 'Draft ready')
  return { segments }
}
