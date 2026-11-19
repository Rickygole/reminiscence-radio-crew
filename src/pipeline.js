import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { AGENTS, createLog } from './events.js'
import { archivist } from './stages/archivist.js'
import { musicDirector } from './stages/music-director.js'
import { scriptwriter } from './stages/scriptwriter.js'
import { careChecker } from './stages/care-checker.js'
import { producer } from './stages/producer.js'
import { validateEvents, assertValid } from './validate.js'

export const STAGE_NAMES = ['archivist', 'music_director', 'scriptwriter', 'care_checker', 'producer']

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path, value) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export const loadData = (root) => ({
  profile: readJson(join(root, 'data/profile.json')),
  library: readJson(join(root, 'data/music-library.json')),
  stories: readJson(join(root, 'data/stories.json')),
  reminders: readJson(join(root, 'data/reminders.json'))
})

const STAGES = {
  archivist: (s, ctx) => archivist({ items: s.inbox, profile: s.data.profile, reminders: s.data.reminders }, ctx),
  music_director: (s, ctx) => musicDirector({ date: s.date, profile: s.data.profile, library: s.data.library, passIds: s.outputs.archivist.passIds }, ctx),
  scriptwriter: (s, ctx) =>
    scriptwriter(
      {
        voices: s.outputs.archivist.voices,
        notes: s.outputs.archivist.notes,
        songs: s.outputs.music_director.songs,
        stories: s.data.stories,
        reminders: s.data.reminders.map(({ id, time }) => ({ id, time })),
        profile: s.data.profile,
        date: s.date,
        passIds: s.outputs.music_director.passIds
      },
      ctx
    ),
  care_checker: (s, ctx) =>
    careChecker({ draft: s.outputs.scriptwriter.segments, held: s.outputs.archivist.held, reminders: s.data.reminders, profile: s.data.profile }, ctx),
  producer: (s, ctx) =>
    producer(
      {
        segments: s.outputs.care_checker.segments,
        safety: s.outputs.care_checker.safety,
        inbox: s.inbox,
        reminders: s.data.reminders,
        profile: s.data.profile,
        date: s.date,
        mode: s.mode,
        runId: s.runId,
        generatedAt: s.startedAt,
        outDir: s.outDir,
        inboxDir: s.inboxDir
      },
      ctx
    )
}

const labelItems = (state) => {
  const family = new Map(state.data.profile.family.map((f) => [f.telegramId, f.name]))
  const items = state.inbox
    .filter((i) => family.has(i.fromTelegramId))
    .map((i) => ({
      id: i.id,
      kind: i.kind,
      label: { voice: 'Voice message', photo: 'Photo', note: 'Note' }[i.kind] + ` from ${family.get(i.fromTelegramId)}`,
      from: family.get(i.fromTelegramId)
    }))
  const hero = items.find((i) => i.kind === 'voice')
  if (hero) hero.hero = true
  for (const r of state.data.reminders) items.push({ id: r.id, kind: 'reminder', label: `Caregiver reminder at ${r.time}` })
  return items
}

export const buildEvents = (state, log, result) => ({
  schemaVersion: 1,
  runId: state.runId,
  startedAt: state.startedAt,
  mode: state.mode,
  agents: AGENTS,
  items: labelItems(state),
  events: log.events,
  result
})

const pruneMedia = (outDir, playlist) => {
  const dir = join(outDir, 'media')
  if (!existsSync(dir)) return
  const used = new Set(playlist.segments.flatMap((s) => [s.audio?.src, s.photo?.src, s.photo?.depthSrc]).filter(Boolean).map((p) => basename(p)))
  for (const name of readdirSync(dir)) if (!used.has(name)) rmSync(join(dir, name), { recursive: true, force: true })
}

export const publish = ({ outDir, flat }, playlist, events) => {
  if (flat) {
    writeJson(join(outDir, 'show.json'), playlist)
    writeJson(join(outDir, 'events.json'), events)
  } else {
    writeJson(join(outDir, 'show', 'latest.json'), playlist)
    pruneMedia(outDir, playlist)
    writeJson(join(outDir, 'events', 'latest.json'), events)
  }
}

export const newState = ({ date, mode, items, inboxDir, outDir, data, startedAt }) => ({
  date,
  mode,
  runId: `${mode}-${date}`,
  startedAt,
  inbox: items,
  inboxDir,
  outDir,
  data,
  outputs: {}
})

export const runStage = async (name, state, ctx) => {
  const index = STAGE_NAMES.indexOf(name)
  state.outputs[name] = await STAGES[name](state, ctx)
  return { index, output: state.outputs[name] }
}

export const runPipeline = async ({ state, adapters, clock, runsDir, flat = false, log = createLog(clock), only }) => {
  const ctx = { emit: log.emit, clock, adapters, profile: state.data.profile }
  const names = only ? [only] : STAGE_NAMES
  for (const name of names) {
    try {
      const { index, output } = await runStage(name, state, ctx)
      if (runsDir) writeJson(join(runsDir, state.date, `0${index + 1}-${name.replace('_', '-')}.json`), output)
    } catch (err) {
      log.emit(name, 'error', err.message)
      const failed = buildEvents(state, log, { status: 'failed_kept_previous' })
      assertValid(validateEvents(failed), 'Crew events')
      const wrapped = new Error(`Stage ${name} failed: ${err.message}`)
      wrapped.events = failed
      throw wrapped
    }
  }
  if (!state.outputs.producer) return { log }
  const playlist = state.outputs.producer
  const events = buildEvents(state, log, { status: 'ok', showId: playlist.showId, segments: playlist.segments.length })
  assertValid(validateEvents(events), 'Crew events')
  publish({ outDir: state.outDir, flat }, playlist, events)
  if (runsDir) writeJson(join(runsDir, state.date, 'events.json'), events)
  return { playlist, events, log }
}

export const saveRun = (runsDir, state, log) => writeJson(join(runsDir, state.date, 'state.json'), { state, events: log.events })

export const loadRun = (runsDir, date) => {
  const file = join(runsDir, date, 'state.json')
  return existsSync(file) ? readJson(file) : null
}
