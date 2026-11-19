import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const sibling = new URL('../../reminiscence-radio/contract/', import.meta.url)

for (const name of ['show-playlist.schema.json', 'crew-events.schema.json']) {
  const other = new URL(name, sibling)
  test(`${name} is byte-identical with the radio copy`, { skip: !existsSync(other) && 'radio repo not present' }, () => {
    const mine = readFileSync(new URL(`../schema/${name}`, import.meta.url))
    assert.ok(mine.equals(readFileSync(other)))
  })
}
