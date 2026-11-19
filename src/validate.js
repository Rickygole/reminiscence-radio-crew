import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const load = (name) => JSON.parse(readFileSync(new URL(`../schema/${name}`, import.meta.url), 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)

const playlist = ajv.compile(load('show-playlist.schema.json'))
const events = ajv.compile(load('crew-events.schema.json'))

const wrap = (fn) => (doc) => ({ valid: fn(doc), errors: fn.errors ?? [] })

export const validatePlaylist = wrap(playlist)
export const validateEvents = wrap(events)

export const assertValid = (result, label) => {
  if (!result.valid) {
    const detail = result.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')
    throw new Error(`${label} failed schema validation: ${detail}`)
  }
}
