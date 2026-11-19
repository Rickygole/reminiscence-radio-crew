import { checkText } from '../safety/rules.js'

const bySender = (items) => {
  const map = new Map()
  for (const item of items) {
    const list = map.get(item.fromTelegramId) ?? []
    list.push(item)
    map.set(item.fromTelegramId, list)
  }
  return map
}

export const MAX_ITEMS = 12
const DAY = 86400000

export const inWindow = (item, date) => {
  const end = Date.parse(`${date}T10:00:00Z`)
  const at = Date.parse(item.receivedAt)
  return at >= end - DAY && at < end
}

export const archivist = async ({ items: all, profile, reminders, date }, ctx) => {
  const { emit } = ctx
  emit('archivist', 'start', 'Opening the family inbox')
  const fresh = all.filter((i) => inWindow(i, date))
  if (fresh.length !== all.length) emit('archivist', 'work', `Left ${all.length - fresh.length} items outside the last 24 hours for another day`)
  const items = fresh.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, MAX_ITEMS)
  if (items.length < fresh.length) emit('archivist', 'work', `Kept the newest ${MAX_ITEMS} items for this show`)
  const family = new Map(profile.family.map((f) => [f.telegramId, f]))
  const known = items.filter((i) => family.has(i.fromTelegramId)).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  const dropped = items.length - known.length
  if (dropped) emit('archivist', 'work', `Ignored ${dropped} items from senders not on the family list`)

  for (const item of known) {
    const who = family.get(item.fromTelegramId).name
    emit('archivist', 'item_in', `${item.kind} from ${who} arrived`, { itemIds: [item.id] })
  }
  for (const r of reminders) {
    emit('archivist', 'item_in', `Caregiver reminder for ${r.time} is on file`, { itemIds: [r.id] })
  }

  const held = []
  const clear = []
  for (const item of known) {
    const text = [item.text, item.caption].filter(Boolean).join(' ')
    const findings = text ? checkText(text, { avoidTopics: profile.avoidTopics }) : []
    if (findings.length) {
      held.push({ item, findings })
      emit('archivist', 'flag', `Holding ${item.id} back: ${findings[0].reason}`, { itemIds: [item.id] })
    } else {
      clear.push(item)
    }
  }
  for (const { item } of held) {
    emit('archivist', 'handoff', 'Held note goes straight to the Care Checker', { to: 'care_checker', itemIds: [item.id] })
  }

  const photos = bySender(clear.filter((i) => i.kind === 'photo'))
  const used = new Set()
  const voices = clear
    .filter((i) => i.kind === 'voice')
    .map((voice) => {
      const mine = photos.get(voice.fromTelegramId) ?? []
      const photo = mine.length ? mine[mine.length - 1] : null
      if (photo) used.add(photo.id)
      return { voice, photo, sender: family.get(voice.fromTelegramId) }
    })
  const notes = clear.filter((i) => i.kind === 'note').map((item) => ({ item, sender: family.get(item.fromTelegramId) }))
  for (const v of voices) {
    emit('archivist', 'work', v.photo ? `Paired ${v.sender.name}'s voice with their latest photo` : `${v.sender.name}'s voice has no photo today`, {
      itemIds: [v.voice.id, v.photo?.id].filter(Boolean)
    })
  }

  const passIds = [
    ...voices.flatMap((v) => [v.voice.id, v.photo?.id].filter(Boolean)),
    ...notes.map((n) => n.item.id),
    ...reminders.map((r) => r.id)
  ]
  emit('archivist', 'handoff', 'Sorted items go to the Music Director', { to: 'music_director', itemIds: passIds })
  emit('archivist', 'done', `Sorted ${known.length} items, held back ${held.length}`)
  return { voices, notes, held, passIds }
}
