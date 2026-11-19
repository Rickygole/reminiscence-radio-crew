export const RULES_VERSION = '1'
export const SAFE_LINE = 'Here is something we picked just for you.'
export const MAX_HOST_WORDS = 30
export const MAX_HOST_SENTENCES = 2

const MEDICAL = [
  'pill', 'pills', 'med', 'meds', 'medication', 'medications', 'medicine', 'medicines', 'drug', 'drugs',
  'prescription', 'prescriptions', 'dose', 'doses', 'dosage', 'tablet', 'tablets', 'capsule', 'capsules',
  'insulin', 'doctor', 'doctors', 'nurse', 'nurses', 'pharmacy', 'symptom', 'symptoms', 'diagnosis',
  'melatonin', 'aspirin', 'ibuprofen', 'tylenol', 'vitamin', 'vitamins', 'supplement', 'supplements',
  'injection', 'dizzy', 'surgery', 'therapy', 'cholesterol', 'diabetes', 'dementia', 'alzheimers'
]
const MEDICAL_PHRASES = ['blood pressure', 'blood sugar', 'heart rate']
const DISTRESSING = ['died', 'dead', 'death', 'dying', 'funeral', 'hospital', 'fire', 'emergency', 'accident', 'cancer']
const QUIZ = ['do you remember', 'can you remember', 'remember when', 'can you recall', 'what year was', 'who am i', 'do you know who']

const NUMBER_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|double|extra'
const DOSE = new RegExp(`\\b(\\d+(\\s\\d+)?|${NUMBER_WORDS})\\s*(mg|ml|pills?|tablets?|capsules?|units?)\\b`)

export const normalize = (text) =>
  String(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const nfc = (text) => String(text).normalize('NFC')

const words = (norm) => (norm ? norm.split(' ') : [])

const sentences = (text) => String(text).split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0)

export const checkText = (text, { avoidTopics = [], kind = 'note' } = {}) => {
  const norm = normalize(text)
  const tokens = new Set(words(norm))
  const padded = ` ${norm} `
  const findings = []
  if (DOSE.test(norm)) findings.push({ rule: 'dose', reason: 'Mentions an amount of medicine; only the caregiver writes care instructions.' })
  if (MEDICAL.some((w) => tokens.has(w)) || MEDICAL_PHRASES.some((p) => padded.includes(` ${p} `))) {
    findings.push({ rule: 'medical', reason: 'Mentions medicine or health care; only the caregiver writes care instructions.' })
  }
  const topic = avoidTopics.find((t) => padded.includes(` ${normalize(t)} `))
  if (topic) findings.push({ rule: 'avoid_topic', reason: `Mentions a topic the caregiver asked us to avoid (${topic}).` })
  if (DISTRESSING.some((w) => tokens.has(w))) findings.push({ rule: 'distressing', reason: 'Mentions something that could be upsetting.' })
  if (QUIZ.some((q) => padded.includes(` ${q} `))) findings.push({ rule: 'memory_quiz', reason: 'Quizzes the listener about memories.' })
  if (kind === 'host' && (tokens.size > MAX_HOST_WORDS || sentences(text).length > MAX_HOST_SENTENCES)) {
    findings.push({ rule: 'too_long', reason: 'Host line is longer than two sentences or thirty words.' })
  }
  return findings
}

export const FIXABLE = new Set(['memory_quiz', 'too_long'])
