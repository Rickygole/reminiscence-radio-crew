import { RULES_VERSION, SAFE_LINE, FIXABLE, checkText, nfc } from '../safety/rules.js'

export const enforceReminders = (segments, reminders) => {
  const fixed = []
  const byId = new Map(reminders.map((r) => [r.id, r]))
  const out = segments.map((seg) => {
    if (seg.kind !== 'reminder') return seg
    const record = byId.get(seg.reminderId)
    if (!record) return seg
    if (seg.text === undefined || nfc(seg.text) === nfc(record.text)) return { ...seg, text: record.text }
    fixed.push({
      itemId: seg.reminderId,
      segmentId: seg.id,
      rule: 'reminder_not_verbatim',
      reason: 'Reminder text was changed; restored the caregiver wording word for word.'
    })
    return { ...seg, text: record.text }
  })
  return { segments: out, fixed }
}

const textOf = (seg) => (seg.kind === 'voice_message' ? seg.caption : seg.text)

const withText = (seg, text) => (seg.kind === 'voice_message' ? { ...seg, caption: text } : { ...seg, text })

export const careChecker = async ({ draft, held = [], reminders, profile }, ctx) => {
  const { emit } = ctx
  emit('care_checker', 'start', 'Reading the draft show and the held back notes')
  const blocked = []
  const fixed = []
  const kept = []

  for (const { item, findings } of held) {
    for (const f of findings) {
      blocked.push({ itemId: item.id, rule: f.rule, reason: f.reason })
    }
    emit('care_checker', 'block', `Blocked ${item.id}: ${findings[0].reason}`, { itemIds: [item.id] })
  }

  const llm = ctx.adapters?.llm
  const llmOn = Boolean(llm?.available?.())

  for (const seg of draft) {
    if (seg.kind === 'reminder') {
      if (!reminders.some((r) => r.id === seg.reminderId)) {
        blocked.push({ itemId: seg.reminderId, segmentId: seg.id, rule: 'reminder_not_verbatim', reason: 'No caregiver reminder with this id exists.' })
        emit('care_checker', 'block', `Dropped reminder ${seg.reminderId}: no caregiver record`, { itemIds: [seg.reminderId] })
        continue
      }
      kept.push(seg)
      continue
    }
    const itemId = seg.sourceItemIds[0] ?? seg.id
    const text = textOf(seg)
    const findings = checkText(text, { avoidTopics: profile.avoidTopics, kind: seg.kind })
    const hard = findings.filter((f) => !FIXABLE.has(f.rule))
    if (hard.length) {
      for (const f of hard) blocked.push({ itemId, segmentId: seg.id, rule: f.rule, reason: f.reason })
      emit('care_checker', 'block', `Blocked ${seg.id}: ${hard[0].reason}`, { itemIds: seg.sourceItemIds })
      continue
    }
    let current = seg
    for (const f of findings) {
      fixed.push({ itemId, segmentId: seg.id, rule: f.rule, reason: f.reason })
      current = withText(current, SAFE_LINE)
      emit('care_checker', 'fix', `Fixed ${seg.id}: ${f.reason}`, { itemIds: seg.sourceItemIds })
    }
    if (llmOn) {
      const verdict = await llm.review(textOf(current))
      if (verdict?.flag) {
        blocked.push({ itemId, segmentId: seg.id, rule: 'llm_flag', reason: verdict.reason || 'Second reader flagged this line.' })
        emit('care_checker', 'block', `Second reader flagged ${seg.id}`, { itemIds: seg.sourceItemIds })
        continue
      }
    }
    kept.push(current)
  }

  const enforced = enforceReminders(kept, reminders)
  for (const f of enforced.fixed) {
    fixed.push(f)
    emit('care_checker', 'fix', `Restored reminder ${f.itemId} word for word`, { itemIds: [f.itemId] })
  }

  const passing = enforced.segments.flatMap((s) => s.sourceItemIds)
  emit('care_checker', 'work', `Kept ${enforced.segments.length} segments, blocked ${blocked.length}, fixed ${fixed.length}`)
  emit('care_checker', 'handoff', 'Safe draft goes to the Producer', { to: 'producer', itemIds: [...new Set(passing)] })
  emit('care_checker', 'done', 'Safety check complete')
  return {
    segments: enforced.segments,
    safety: { rulesVersion: RULES_VERSION, llmReview: llmOn, blocked, fixed }
  }
}
