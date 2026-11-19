import test from 'node:test'
import assert from 'node:assert/strict'
import { mapUpdates, parseRemind, telegram } from '../src/adapters/telegram.js'
import { polly } from '../src/adapters/polly.js'
import { llm } from '../src/adapters/llm.js'
import { depth } from '../src/adapters/depth.js'

const profile = {
  family: [
    { name: 'Leo', telegramId: '1001', role: 'family' },
    { name: 'Ellen', telegramId: '1003', role: 'caregiver' }
  ]
}
const allowlist = ['1001', '1003']
const msg = (id, from, extra, chatType = 'private') => ({ update_id: id, message: { date: 1764800000, from: { id: from }, chat: { type: chatType }, ...extra } })

test('maps voice, photo and note updates', () => {
  const { items } = mapUpdates(
    [msg(1, 1001, { voice: { file_id: 'v', duration: 9 }, caption: 'hi' }), msg(2, 1001, { photo: [{ file_id: 's' }, { file_id: 'big' }] }), msg(3, 1001, { text: 'hello' })],
    { allowlist, profile }
  )
  assert.deepEqual(items.map((i) => [i.id, i.kind]), [['tg-1', 'voice'], ['tg-2', 'photo'], ['tg-3', 'note']])
  assert.equal(items[0].durationMs, 9000)
  assert.equal(items[1].fileId, 'big')
})

test('drops senders outside the allowlist and non-private chats', () => {
  const { items } = mapUpdates([msg(1, 5555, { text: 'x' }), msg(2, 1001, { text: 'y' }, 'group')], { allowlist, profile })
  assert.deepEqual(items, [])
})

test('only the caregiver can set reminders', () => {
  const { reminders } = mapUpdates([msg(1, 1003, { text: '/remind 12:30 Time for lunch, Rose.' }), msg(2, 1001, { text: '/remind 12:30 sneaky' })], { allowlist, profile })
  assert.deepEqual(reminders, [{ id: 'rem-1', time: '12:30', text: 'Time for lunch, Rose.' }])
})

test('parseRemind validates time and trims text', () => {
  assert.equal(parseRemind('/remind 25:00 nope'), null)
  assert.equal(parseRemind('/remind 09:15'), null)
  assert.deepEqual(parseRemind('/remind 09:15   Water the plants\u0007  '), { time: '09:15', text: 'Water the plants' })
  assert.equal(parseRemind(`/remind 09:15 ${'a'.repeat(300)}`).text.length, 200)
})

test('adapters are unavailable with an empty environment', () => {
  const env = {}
  for (const a of [telegram(env), polly(env), llm(env), depth(env)]) assert.equal(a.available(), false)
})

test('adapters switch on from environment variables', () => {
  assert.equal(telegram({ TELEGRAM_BOT_TOKEN: 't', FAMILY_ALLOWLIST: '1' }).available(), true)
  assert.equal(depth({ DEPTH: '1' }).available(), true)
  const aws = { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 's', AWS_REGION: 'us-east-1' }
  assert.equal(polly(aws).available(), true)
  assert.equal(llm(aws).available(), false)
  assert.equal(llm({ ...aws, LLM_MODEL_ID: 'm' }).available(), true)
})
