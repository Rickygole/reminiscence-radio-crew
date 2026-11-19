#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAdapters, demoAdapters } from '../src/adapters/index.js'
import { checkDownload, mapUpdates } from '../src/adapters/telegram.js'
import { demoClock, realClock, createLog } from '../src/events.js'
import { STAGE_NAMES, loadData, newState, runPipeline, saveRun, loadRun } from '../src/pipeline.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [command, ...rest] = process.argv.slice(2)

const parse = (args) => {
  const opts = { _: [] }
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      opts[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true
    } else opts._.push(args[i])
  }
  return opts
}

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback)
const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

const today = () => new Date().toISOString().slice(0, 10)

const ingest = async () => {
  const adapters = buildAdapters()
  if (!adapters.telegram.available()) {
    console.log('Telegram is not configured; nothing to ingest')
    return
  }
  const data = loadData(root)
  const stateFile = join(root, 'inbox/state.json')
  const state = readJson(stateFile, { offset: 0 })
  const updates = await adapters.telegram.getUpdates(state.offset)
  const { items, reminders } = mapUpdates(updates, { allowlist: adapters.telegram.allowlist(), profile: data.profile })
  const all = readJson(join(root, 'inbox/items.json'), [])
  if (updates.length) {
    state.offset = updates[updates.length - 1].update_id + 1
    writeJson(stateFile, state)
  }
  if (reminders.length) {
    const file = join(root, 'data/reminders.json')
    writeJson(file, [...readJson(file, []), ...reminders])
  }
  for (const item of items) {
    if (item.fileId) {
      try {
        const { bytes, path } = await adapters.telegram.download(item.fileId)
        item.file = `files/${item.id}${checkDownload(path, bytes)}`
        mkdirSync(join(root, 'inbox/files'), { recursive: true })
        writeFileSync(join(root, 'inbox', item.file), bytes)
      } catch (err) {
        console.error(`Skipped ${item.id}: ${err.message}`)
        continue
      }
    }
    all.push(item)
    writeJson(join(root, 'inbox/items.json'), all)
  }
  console.log(`Ingested ${items.length} items and ${reminders.length} reminders`)
}

const run = async (opts) => {
  const demo = opts.demo === true
  const date = typeof opts.date === 'string' ? opts.date : today()
  const data = loadData(root)
  const inboxDir = demo ? join(root, 'fixtures/demo-inbox') : join(root, 'inbox')
  const items = demo ? readJson(join(inboxDir, 'inbox.json'), []) : readJson(join(inboxDir, 'items.json'), [])
  const outDir = resolve(typeof opts.out === 'string' ? opts.out : join(root, 'public'))
  const startedAt = demo ? `${date}T10:00:00Z` : new Date().toISOString()
  let clock = demo ? demoClock() : realClock(Date.parse(startedAt))
  const adapters = demo ? demoAdapters() : buildAdapters()
  const runsDir = join(root, 'runs')

  let state = newState({ date, mode: demo ? 'demo' : 'live', items, inboxDir, outDir, data, startedAt })
  let log = createLog(clock)
  let only
  if (opts.stage) {
    only = opts.stage
    const prior = loadRun(runsDir, date)
    if (prior) {
      state = { ...prior.state, inboxDir, outDir, data }
      clock = realClock(Date.parse(state.startedAt))
      log = createLog(clock, prior.events)
    }
  }
  try {
    const out = await runPipeline({ state, adapters, clock, runsDir, flat: demo, log, only })
    saveRun(runsDir, state, out.log)
    if (out.playlist) console.log(`Published ${out.playlist.showId} with ${out.playlist.segments.length} segments to ${outDir}`)
    else console.log(`Stage ${only} complete`)
  } catch (err) {
    if (err.events && !opts.stage) {
      const file = demo ? join(outDir, 'events.json') : join(outDir, 'events', 'latest.json')
      writeJson(file, err.events)
    }
    console.error(err.message)
    process.exitCode = 1
  }
}

const opts = parse(rest)
if (command === 'run') await run(opts)
else if (command === 'stage') {
  if (!STAGE_NAMES.includes(opts._[0])) {
    console.error(`Unknown stage. Use one of: ${STAGE_NAMES.join(', ')}`)
    process.exitCode = 2
  } else await run({ ...opts, stage: opts._[0] })
} else if (command === 'ingest') await ingest()
else {
  console.error('Usage: crew run [--demo] [--date YYYY-MM-DD] [--out DIR] | crew stage <name> --date YYYY-MM-DD | crew ingest')
  process.exitCode = 2
}
