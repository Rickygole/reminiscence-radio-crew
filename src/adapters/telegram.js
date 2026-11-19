const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const CONTROL = /[\u0000-\u001f\u007f]/g

export const parseRemind = (text) => {
  const m = /^\/remind\s+(\S+)\s+([\s\S]+)$/.exec(String(text).trim())
  if (!m || !TIME.test(m[1])) return null
  const body = m[2].replace(CONTROL, ' ').trim().slice(0, 200)
  return body ? { time: m[1], text: body } : null
}

export const mapUpdates = (updates, { allowlist, profile }) => {
  const allowed = new Set(allowlist.map(String))
  const roles = new Map(profile.family.map((f) => [f.telegramId, f.role]))
  const items = []
  const reminders = []
  for (const u of updates) {
    const msg = u.message
    if (!msg || msg.chat?.type !== 'private') continue
    const from = String(msg.from?.id ?? '')
    if (!allowed.has(from)) continue
    const base = { id: `tg-${u.update_id}`, fromTelegramId: from, receivedAt: new Date(msg.date * 1000).toISOString() }
    if (typeof msg.text === 'string' && msg.text.startsWith('/remind')) {
      const parsed = roles.get(from) === 'caregiver' ? parseRemind(msg.text) : null
      if (parsed) reminders.push({ id: `rem-${u.update_id}`, ...parsed })
    } else if (msg.voice) {
      items.push({ ...base, kind: 'voice', fileId: msg.voice.file_id, durationMs: Math.max(1, Math.round(msg.voice.duration * 1000)), ...(msg.caption ? { caption: msg.caption } : {}) })
    } else if (Array.isArray(msg.photo) && msg.photo.length) {
      items.push({ ...base, kind: 'photo', fileId: msg.photo[msg.photo.length - 1].file_id, ...(msg.caption ? { caption: msg.caption } : {}) })
    } else if (typeof msg.text === 'string' && msg.text.trim()) {
      items.push({ ...base, kind: 'note', text: msg.text.replace(CONTROL, ' ').trim() })
    }
  }
  return { items, reminders }
}

export const telegram = (env = process.env) => {
  const api = (method) => `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`
  return {
    available: () => Boolean(env.TELEGRAM_BOT_TOKEN && env.FAMILY_ALLOWLIST),
    allowlist: () => String(env.FAMILY_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    async getUpdates(offset) {
      const res = await fetch(`${api('getUpdates')}?timeout=0&offset=${offset}&allowed_updates=${encodeURIComponent('["message"]')}`)
      const body = await res.json()
      if (!body.ok) throw new Error(`Telegram getUpdates failed: ${body.description}`)
      return body.result
    },
    async download(fileId) {
      const info = await (await fetch(`${api('getFile')}?file_id=${encodeURIComponent(fileId)}`)).json()
      if (!info.ok) throw new Error(`Telegram getFile failed: ${info.description}`)
      const res = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${info.result.file_path}`)
      return { bytes: Buffer.from(await res.arrayBuffer()), path: info.result.file_path }
    }
  }
}
