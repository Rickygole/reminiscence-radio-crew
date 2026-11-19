import { telegram } from './telegram.js'
import { polly } from './polly.js'
import { llm } from './llm.js'
import { depth } from './depth.js'

export const buildAdapters = (env = process.env) => ({
  telegram: telegram(env),
  polly: polly(env),
  llm: llm(env),
  depth: depth(env)
})

export const demoAdapters = () => {
  const off = { available: () => false }
  return { telegram: off, polly: off, llm: off, depth: off }
}
