import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoAdapters } from '../src/adapters/index.js'
import { demoClock, createLog } from '../src/events.js'
import { loadData, newState, runPipeline, publish, checkReminders } from '../src/pipeline.js'
import { validatePlaylist, validateEvents } from '../src/validate.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const inboxDir = join(root, 'fixtures/demo-inbox')
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))

const demo = async (items = readJson(join(inboxDir, 'inbox.json'))) => {
  const outDir = mkdtempSync(join(tmpdir(), 'crew-'))
  const clock = demoClock()
  const state = newState({ date: '2026-12-04', mode: 'demo', items, inboxDir, outDir, data: loadData(root), startedAt: '2026-12-04T10:00:00Z' })
  const out = await runPipeline({ state, adapters: demoAdapters(), clock, log: createLog(clock), flat: true })
  return { ...out, outDir }
}

test('demo run validates against both schemas', async () => {
  const { playlist, events } = await demo()
  assert.equal(validatePlaylist(playlist).valid, true)
  assert.equal(validateEvents(events).valid, true)
})

test('demo run is deterministic', async () => {
  const a = await demo()
  const b = await demo()
  assert.deepEqual(a.playlist, b.playlist)
  assert.deepEqual(a.events, b.events)
})

test('pills note is blocked and only travels Archivist to Care Checker', async () => {
  const { playlist, events } = await demo()
  assert.ok(playlist.safety.blocked.some((f) => f.itemId === 'tg-1047'))
  const trail = events.events.filter((e) => e.itemIds?.includes('tg-1047'))
  assert.deepEqual(trail.map((e) => `${e.agent}:${e.type}`), ['archivist:item_in', 'archivist:flag', 'archivist:handoff', 'care_checker:block'])
  assert.equal(trail[2].to, 'care_checker')
  assert.ok(!JSON.stringify(playlist.segments).includes('extra pills'))
})

test('Leo travels through all five agents and airs as a voice message with a photo', async () => {
  const { playlist, events } = await demo()
  const touched = new Set(events.events.filter((e) => e.itemIds?.includes('tg-1042')).map((e) => e.agent))
  assert.deepEqual([...touched].sort(), ['archivist', 'care_checker', 'music_director', 'producer', 'scriptwriter'])
  const voice = playlist.segments.find((s) => s.kind === 'voice_message')
  assert.equal(voice.from.name, 'Leo')
  assert.ok(voice.photo.src && voice.photo.depthSrc && voice.photo.alt)
  assert.ok(events.items.find((i) => i.id === 'tg-1042').hero)
})

test('reminder text is copied exactly from the caregiver record', async () => {
  const { playlist } = await demo()
  const records = readJson(join(root, 'data/reminders.json'))
  for (const r of records) {
    assert.equal(playlist.segments.find((s) => s.reminderId === r.id).text, r.text)
  }
})

test('media is copied next to the show', async () => {
  const { outDir } = await demo()
  for (const f of ['leo.mp3', 'leo.svg', 'leo-depth.png']) assert.ok(existsSync(join(outDir, 'media', f)))
})

test('senders outside the family list are ignored', async () => {
  const items = [...readJson(join(inboxDir, 'inbox.json')), { id: 'tg-9', kind: 'note', fromTelegramId: '9999', receivedAt: '2026-12-03T23:30:00Z', text: 'hello stranger' }]
  const { playlist, events } = await demo(items)
  assert.ok(!JSON.stringify(playlist).includes('stranger'))
  assert.ok(!events.items.some((i) => i.id === 'tg-9'))
})

test('a failing stage reports failed_kept_previous', async () => {
  const items = readJson(join(inboxDir, 'inbox.json')).map((i) => (i.kind === 'voice' ? { ...i, file: 'media/missing.mp3' } : i))
  await assert.rejects(demo(items), (err) => err.events.result.status === 'failed_kept_previous' && err.events.events.at(-1).type === 'error')
})

test('live publish writes only latest and prunes unreferenced media', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'crew-'))
  mkdirSync(join(outDir, 'media'))
  for (const f of ['keep.mp3', 'photo.png', 'old.mp3']) writeFileSync(join(outDir, 'media', f), 'x')
  const playlist = { segments: [{ audio: { src: 'media/keep.mp3' }, photo: { src: 'media/photo.png' } }, { audio: { speak: true } }] }
  publish({ outDir, flat: false }, playlist, { events: [] })
  assert.deepEqual(readdirSync(join(outDir, 'show')), ['latest.json'])
  assert.deepEqual(readdirSync(join(outDir, 'media')).sort(), ['keep.mp3', 'photo.png'])
})

test('only items from the last 24 hours before the show are used, newest twelve at most', async () => {
  const base = readJson(join(inboxDir, 'inbox.json'))
  const stale = { id: 'tg-1', kind: 'note', fromTelegramId: '1002', receivedAt: '2026-11-20T10:00:00Z', text: 'An old hello' }
  const { playlist } = await demo([...base, stale])
  assert.ok(!playlist.segments.some((s) => s.sourceItemIds.includes('tg-1')))
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `tg-n${i}`, kind: 'note', fromTelegramId: '1002', receivedAt: `2026-12-03T${String(10 + (i % 12)).padStart(2, '0')}:${String(i).padStart(2, '0')}:00Z`, text: `Hello number ${i}` }))
  const { events } = await demo(many)
  assert.equal(events.events.filter((e) => e.agent === 'archivist' && e.type === 'item_in' && e.itemIds?.[0].startsWith('tg-')).length, 12)
})

test('reminders over 200 characters or with repeated ids fail loudly', () => {
  assert.throws(() => checkReminders([{ id: 'a', text: 'x'.repeat(201), time: '09:00' }]), /200 characters/)
  assert.throws(() => checkReminders([{ id: 'a', text: 'x', time: '09:00' }, { id: 'a', text: 'y', time: '10:00' }]), /more than once/)
})

test('host, story and reminder lines use the recorded voice bank when present', async () => {
  const { playlist, outDir } = await demo()
  const spoken = playlist.segments.filter((s) => ['host', 'story', 'reminder'].includes(s.kind))
  for (const s of spoken) {
    assert.match(s.audio.src, /^media\/tts-[0-9a-f]{16}\.mp3$/)
    assert.ok(existsSync(join(outDir, s.audio.src)))
  }
})
