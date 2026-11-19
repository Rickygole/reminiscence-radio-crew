import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkText } from '../src/safety/rules.js'
import { careChecker, enforceReminders } from '../src/stages/care-checker.js'
import { createLog, demoClock } from '../src/events.js'

const tricky = JSON.parse(readFileSync(new URL('../fixtures/tricky.json', import.meta.url), 'utf8'))
const profile = { name: 'Rose', avoidTopics: ['Walter'] }
const reminders = [
  { id: 'rem-pill', text: "Time for your 9 o'clock pill, Rose.", time: '09:00' },
  { id: 'rem-lunch', text: 'Time for lunch, Rose.', time: '12:00' }
]

const run = (draft, adapters = {}) => {
  const log = createLog(demoClock())
  return careChecker({ draft, held: [], reminders, profile }, { ...log, adapters, profile }).then((out) => ({ ...out, events: log.events }))
}

const host = (id, text) => ({ id, kind: 'host', text, audio: { speak: true }, sourceItemIds: [`src-${id}`] })

for (const c of tricky.blocked) {
  test(`blocks: ${c.text}`, () => {
    const findings = checkText(c.text, { avoidTopics: profile.avoidTopics })
    assert.equal(findings[0]?.rule, c.rule)
  })
}

for (const text of tricky.passes) {
  test(`passes: ${text}`, () => {
    assert.deepEqual(checkText(text, { avoidTopics: profile.avoidTopics }), [])
  })
}

test('caregiver reminder with a pill passes the verbatim path', async () => {
  const out = await run([{ id: 'r1', kind: 'reminder', reminderId: 'rem-pill', author: 'caregiver', audio: { speak: true }, sourceItemIds: ['rem-pill'] }])
  assert.equal(out.segments[0].text, "Time for your 9 o'clock pill, Rose.")
  assert.deepEqual(out.safety.blocked, [])
})

test('altered reminder is restored and logged as fixed', async () => {
  const out = await run([{ id: 'r1', kind: 'reminder', reminderId: 'rem-lunch', text: 'Time for lunch, Rose!', author: 'caregiver', audio: { speak: true }, sourceItemIds: ['rem-lunch'] }])
  assert.equal(out.segments[0].text, 'Time for lunch, Rose.')
  assert.equal(out.safety.fixed[0].rule, 'reminder_not_verbatim')
})

test('enforceReminders treats NFC equivalent text as verbatim', () => {
  const decomposed = 'Time for lunch, Rose.'.normalize('NFD')
  const { fixed } = enforceReminders([{ id: 'r', kind: 'reminder', reminderId: 'rem-lunch', text: decomposed }], reminders)
  assert.deepEqual(fixed, [])
})

test('memory quiz line is replaced', async () => {
  const out = await run([host('h1', 'Do you remember 1962?')])
  assert.equal(out.safety.fixed[0].rule, 'memory_quiz')
  assert.doesNotMatch(out.segments[0].text, /remember/i)
})

test('forty word host line is fixed as too_long', async () => {
  const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
  const out = await run([host('h1', long)])
  assert.equal(out.safety.fixed[0].rule, 'too_long')
})

test('fake second reader cannot unblock a rule-blocked line', async () => {
  const llm = { available: () => true, review: async () => ({ flag: false }) }
  const out = await run([host('h1', 'The doctor visit went well')], { llm })
  assert.equal(out.segments.length, 0)
  assert.equal(out.safety.blocked[0].rule, 'medical')
  assert.equal(out.safety.llmReview, true)
})

test('fake second reader can block a clean line', async () => {
  const llm = { available: () => true, review: async () => ({ flag: true, reason: 'tone' }) }
  const out = await run([host('h1', 'Rose loved dancing at the Elks club')], { llm })
  assert.equal(out.segments.length, 0)
  assert.equal(out.safety.blocked[0].rule, 'llm_flag')
})
