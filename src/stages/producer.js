import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ttsName } from '../adapters/polly.js'
import { execFileSync } from 'node:child_process'
import { basename, extname, join } from 'node:path'
import { enforceReminders } from './care-checker.js'
import { validatePlaylist, assertValid } from '../validate.js'

export const VOICE_BANK = fileURLToPath(new URL('../../voice', import.meta.url))
export const BANK_VOICE = 'kokoro-af_heart'

const OGG = new Set(['.ogg', '.oga', '.opus'])

const makeMedia = (inboxDir, mediaDir) => {
  mkdirSync(mediaDir, { recursive: true })
  return (rel) => {
    const from = join(inboxDir, rel)
    const ext = extname(rel).toLowerCase()
    const stem = basename(rel, extname(rel))
    if (OGG.has(ext)) {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-protocol_whitelist', 'file', '-f', 'ogg', '-i', from, '-codec:a', 'libmp3lame', '-q:a', '5', join(mediaDir, `${stem}.mp3`)])
      return `media/${stem}.mp3`
    }
    copyFileSync(from, join(mediaDir, basename(rel)))
    return `media/${basename(rel)}`
  }
}

export const producer = async (input, ctx) => {
  const { segments: draft, safety, inbox, reminders, profile, date, mode, runId, generatedAt, outDir, inboxDir } = input
  const { emit, adapters } = ctx
  emit('producer', 'start', 'Assembling the show and preparing audio')
  const mediaDir = join(outDir, 'media')
  const media = makeMedia(inboxDir, mediaDir)
  const byId = new Map(inbox.map((i) => [i.id, i]))

  const restored = enforceReminders(draft, reminders)
  for (const f of restored.fixed) {
    safety.fixed.push(f)
    emit('producer', 'fix', `Restored reminder ${f.itemId} from the caregiver record`, { itemIds: [f.itemId] })
  }
  let ordered = restored.segments.map((seg) => {
    if (seg.kind !== 'reminder') return seg
    const record = reminders.find((r) => r.id === seg.reminderId)
    return { ...seg, text: record.text, time: record.time }
  })
  if (!ordered.some((s) => s.kind === 'reminder')) ordered = ordered.filter((s) => s.id !== 'caregiver-intro')

  const bank = (text) => {
    const name = ttsName(text, BANK_VOICE)
    if (!existsSync(join(VOICE_BANK, name))) return { speak: true }
    copyFileSync(join(VOICE_BANK, name), join(mediaDir, name))
    return { src: `media/${name}` }
  }
  const tts = async (text) => (adapters.polly.available() ? adapters.polly.synth(text, mediaDir) : bank(text))

  const segments = []
  for (const seg of ordered) {
    const out = { ...seg }
    if (seg.kind === 'host' || seg.kind === 'story' || seg.kind === 'reminder') {
      out.audio = await tts(seg.text)
    } else if (seg.kind === 'voice_message') {
      out.audio = { src: media(seg.audio.src), ...(seg.audio.durationMs ? { durationMs: seg.audio.durationMs } : {}) }
      if (seg.photo) {
        const photoItem = seg.sourceItemIds.map((id) => byId.get(id)).find((i) => i?.kind === 'photo')
        const photo = { src: media(seg.photo.src), alt: seg.photo.alt }
        if (adapters.depth.available()) {
          const depthName = `${basename(seg.photo.src, extname(seg.photo.src))}-depth.png`
          await adapters.depth.estimate(join(inboxDir, seg.photo.src), join(mediaDir, depthName))
          photo.depthSrc = `media/${depthName}`
        } else if (photoItem?.depthFile) {
          photo.depthSrc = media(photoItem.depthFile)
        }
        out.photo = photo
      }
    }
    segments.push(out)
  }
  emit('producer', 'work', `Ordered ${segments.length} segments and prepared their audio`, { itemIds: [...new Set(segments.flatMap((s) => s.sourceItemIds))] })

  const playlist = {
    schemaVersion: 1,
    showId: `${date}-${profile.name.toLowerCase()}`,
    date,
    mode,
    listener: { name: profile.name, birthYear: profile.birthYear, fictional: true },
    generatedAt,
    runId,
    segments,
    safety
  }
  assertValid(validatePlaylist(playlist), 'Show playlist')
  emit('producer', 'done', `Show ${playlist.showId} is ready to air`)
  return playlist
}
