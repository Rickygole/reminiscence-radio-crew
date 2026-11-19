import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePlaylist, validateEvents } from '../src/validate.js'

const sample = () => ({
  schemaVersion: 1,
  showId: '2026-12-04-rose',
  date: '2026-12-04',
  mode: 'demo',
  listener: { name: 'Rose', birthYear: 1946, fictional: true },
  generatedAt: '2026-12-04T10:00:00Z',
  runId: 'demo-2026-12-04',
  segments: [
    { id: 's1', kind: 'host', text: 'Good morning, Rose. Your grandson Leo sent you something.', audio: { speak: true }, sourceItemIds: ['tg-1042'] },
    {
      id: 's2',
      kind: 'voice_message',
      from: { name: 'Leo', relation: 'grandson' },
      caption: 'A message from Leo, your grandson',
      performedByVolunteer: true,
      audio: { src: 'media/leo.mp3', durationMs: 9400 },
      photo: { src: 'media/leo.jpg', depthSrc: 'media/leo-depth.png', alt: 'Leo smiling on a porch swing' },
      sourceItemIds: ['tg-1042', 'tg-1043']
    },
    {
      id: 's3',
      kind: 'song',
      title: 'Porch Light Waltz',
      era: '1962',
      credit: { author: 'Reminiscence Radio team', license: 'CC0-1.0', source: 'src/radio/song-synth.js' },
      audio: { synth: { recipe: 'doowop_ballad', seed: 62, bpm: 66, key: 'Bb', seconds: 75 } },
      sourceItemIds: []
    },
    { id: 's5', kind: 'reminder', reminderId: 'rem-lunch', text: 'Time for lunch, Rose.', time: '12:00', author: 'caregiver', audio: { speak: true }, sourceItemIds: ['rem-lunch'] },
    { id: 's6', kind: 'story', text: 'A story.', year: 1962, sourceUrl: 'https://www.loc.gov/', audio: { speak: true }, sourceItemIds: ['story-12'] }
  ],
  safety: {
    rulesVersion: '1',
    llmReview: false,
    blocked: [{ itemId: 'tg-1047', rule: 'medical', reason: 'Family note asks for extra pills; only the caregiver writes care instructions.' }],
    fixed: []
  }
})

const seg = (doc, kind) => doc.segments.find((s) => s.kind === kind)

test('sample passes', () => {
  const r = validatePlaylist(sample())
  assert.equal(r.valid, true, JSON.stringify(r.errors))
})

test('voice_message with speak audio fails', () => {
  const d = sample()
  seg(d, 'voice_message').audio = { speak: true }
  assert.equal(validatePlaylist(d).valid, false)
})

test('song with speak audio fails', () => {
  const d = sample()
  seg(d, 'song').audio = { speak: true }
  assert.equal(validatePlaylist(d).valid, false)
})

test('reminder without text fails', () => {
  const d = sample()
  delete seg(d, 'reminder').text
  assert.equal(validatePlaylist(d).valid, false)
})

test('reminder with family author fails', () => {
  const d = sample()
  seg(d, 'reminder').author = 'family'
  assert.equal(validatePlaylist(d).valid, false)
})

test('photo without alt fails', () => {
  const d = sample()
  delete seg(d, 'voice_message').photo.alt
  assert.equal(validatePlaylist(d).valid, false)
})

test('fictional false fails', () => {
  const d = sample()
  d.listener.fictional = false
  assert.equal(validatePlaylist(d).valid, false)
})

test('unknown kind fails', () => {
  const d = sample()
  d.segments.push({ id: 's9', kind: 'clone', text: 'x', audio: { speak: true }, sourceItemIds: [] })
  assert.equal(validatePlaylist(d).valid, false)
})

const events = (handoff) => ({
  schemaVersion: 1,
  runId: 'demo-2026-12-04',
  startedAt: '2026-12-04T10:00:00Z',
  mode: 'demo',
  agents: [{ id: 'archivist', name: 'Archivist', job: 'Sorts the inbox' }],
  items: [{ id: 'tg-1042', kind: 'voice', label: 'Voice message from Leo', from: 'Leo', hero: true }],
  events: [{ seq: 1, t: 0, agent: 'archivist', type: 'handoff', message: 'Passing it on', ...handoff }],
  result: { status: 'ok', showId: '2026-12-04-rose', segments: 5 }
})

test('handoff with to and itemIds passes', () => {
  assert.equal(validateEvents(events({ to: 'music_director', itemIds: ['tg-1042'] })).valid, true)
})

test('handoff without to fails', () => {
  assert.equal(validateEvents(events({ itemIds: ['tg-1042'] })).valid, false)
})

test('handoff without itemIds fails', () => {
  assert.equal(validateEvents(events({ to: 'music_director' })).valid, false)
})
