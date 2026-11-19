import test from 'node:test'
import assert from 'node:assert/strict'
import { mapUpdates, parseRemind, telegram, checkDownload, MAX_DOWNLOAD } from '../src/adapters/telegram.js'
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

test('captions lose control characters and extra whitespace', () => {
  const { items } = mapUpdates([msg(1, 1001, { voice: { file_id: 'v', duration: 3 }, caption: ' hi\u0000\u001b[31m  there\n\u007f ' }), msg(2, 1001, { photo: [{ file_id: 'p' }], caption: '\u0007' })], { allowlist, profile })
  assert.equal(items[0].caption, 'hi [31m there')
  assert.equal('caption' in items[1], false)
})

test('downloads must have an allowed extension, a small size and matching magic bytes', () => {
  const ogg = Buffer.from('OggS....')
  assert.equal(checkDownload('voice/file_1.oga', ogg), '.oga')
  assert.equal(checkDownload('photos/file_2.JPG', Buffer.from([0xff, 0xd8, 0xff, 0xe0])), '.jpg')
  assert.equal(checkDownload('photos/file_3.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])), '.png')
  assert.throws(() => checkDownload('docs/file_4.m3u8', ogg), /not allowed/)
  assert.throws(() => checkDownload('voice/file_5', ogg), /not allowed/)
  assert.throws(() => checkDownload('voice/file_6.ogg', Buffer.from('#EXTM3U')), /does not match/)
  assert.throws(() => checkDownload('photos/file_7.png', Buffer.from([0xff, 0xd8, 0xff])), /does not match/)
  assert.throws(() => checkDownload('voice/file_8.ogg', Buffer.alloc(MAX_DOWNLOAD + 1, 0x4f)), /20 MB/)
})

test('rejected reminders are reported with a reason', () => {
  const { rejected } = mapUpdates([msg(1, 1001, { text: '/remind 12:30 sneaky' }), msg(2, 1003, { text: '/remind 99:99 bad' })], { allowlist, profile })
  assert.deepEqual(rejected.map((r) => r.id), ['rem-1', 'rem-2'])
  assert.match(rejected[0].reason, /caregiver/)
})
