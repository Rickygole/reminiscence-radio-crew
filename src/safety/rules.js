export const RULES_VERSION = '1'
export const SAFE_LINE = 'Here is something we picked just for you.'
export const MAX_HOST_WORDS = 30
export const MAX_HOST_SENTENCES = 2

const MEDICAL = [
  'pill', 'pills', 'med', 'meds', 'medication', 'medications', 'medicine', 'medicines', 'drug', 'drugs',
  'prescription', 'prescriptions', 'dose', 'doses', 'dosage', 'tablet', 'tablets', 'capsule', 'capsules',
  'insulin', 'doctor', 'doctors', 'nurse', 'nurses', 'pharmacy', 'symptom', 'symptoms', 'diagnosis',
  'melatonin', 'aspirin', 'ibuprofen', 'tylenol', 'vitamin', 'vitamins', 'supplement', 'supplements',
  'injection', 'pharmacist', 'pharmacists', 'prescribed', 'overdose', 'overdosed', 'antibiotic', 'antibiotics', 'painkiller', 'painkillers', 'dizzy', 'surgery', 'therapy', 'cholesterol', 'diabetes', 'dementia', 'alzheimers'
]
const MEDICAL_PHRASES = ['blood pressure', 'blood sugar', 'heart rate']
const DISTRESSING = ['died', 'dead', 'death', 'dying', 'funeral', 'hospital', 'hospitalized', 'hospitalised', 'fire', 'emergency', 'accident', 'cancer', 'killed', 'suicide']
const DISTRESSING_PHRASES = ['passed away']
const QUIZ = ['do you remember', 'can you remember', 'remember when', 'can you recall', 'what year was', 'who am i', 'do you know who']

const NUMBER_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|double|extra'
const DOSE = new RegExp(`\\b(\\d+(\\s\\d+)?|${NUMBER_WORDS})\\s*(mg|mcg|ml|tsp|tbsp|drops?|pills?|tablets?|capsules?|units?)\\b`)
const TAKE_SOME = new RegExp(`\\btake (\\d+|${NUMBER_WORDS}) of (them|those|these|it)\\b`)
const LONG_TERM = 8

const CONFUSABLES = {
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's',
  α: 'a', β: 'b', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x'
}
const CONFUSABLE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'g')

export const normalize = (text) =>
  String(text)
    .normalize('NFKD')
    .replace(/[\p{Cf}\p{M}]/gu, '')
    .toLowerCase()
    .replace(CONFUSABLE, (c) => CONFUSABLES[c])
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const joinWithin = (text) => normalize(String(text).replace(/(?<=[\p{L}\p{N}])[-.'_*\u00b7\u2010-\u2015](?=[\p{L}\p{N}])/gu, ''))
const joinSingles = (norm) => norm.replace(/(?:^| )(?:\p{L} ){2,}\p{L}(?= |$)/gu, (m) => ` ${m.replace(/ /g, '')}`).trim()

export const nfc = (text) => String(text).normalize('NFC')

const words = (norm) => (norm ? norm.split(' ') : [])

const sentences = (text) => String(text).split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0)

export const checkText = (text, { avoidTopics = [], kind = 'note' } = {}) => {
  const norm = normalize(text)
  const tokens = new Set(words(norm))
  const joined = joinWithin(text)
  const matchable = new Set([...tokens, ...words(joined), ...words(joinSingles(norm)), ...words(joinSingles(joined))])
  const collapsed = norm.replace(/[^\p{L}\p{N}]/gu, '')
  const hasTerm = (list, deep = false) => list.some((w) => matchable.has(w) || (deep && w.length >= LONG_TERM && collapsed.includes(w)))
  const padded = ` ${norm} `
  const findings = []
  if (DOSE.test(norm) || DOSE.test(joined) || TAKE_SOME.test(norm)) findings.push({ rule: 'dose', reason: 'Mentions an amount of medicine; only the caregiver writes care instructions.' })
  if (hasTerm(MEDICAL, true) || MEDICAL_PHRASES.some((p) => padded.includes(` ${p} `))) {
    findings.push({ rule: 'medical', reason: 'Mentions medicine or health care; only the caregiver writes care instructions.' })
  }
  const topic = avoidTopics.find((t) => padded.includes(` ${normalize(t)} `))
  if (topic) findings.push({ rule: 'avoid_topic', reason: `Mentions a topic the caregiver asked us to avoid (${topic}).` })
  if (hasTerm(DISTRESSING) || DISTRESSING_PHRASES.some((p) => padded.includes(` ${p} `))) findings.push({ rule: 'distressing', reason: 'Mentions something that could be upsetting.' })
  if (QUIZ.some((q) => padded.includes(` ${q} `))) findings.push({ rule: 'memory_quiz', reason: 'Quizzes the listener about memories.' })
  if (kind === 'host' && (tokens.size > MAX_HOST_WORDS || sentences(text).length > MAX_HOST_SENTENCES)) {
    findings.push({ rule: 'too_long', reason: 'Host line is longer than two sentences or thirty words.' })
  }
  return findings
}

export const FIXABLE = new Set(['memory_quiz', 'too_long'])
