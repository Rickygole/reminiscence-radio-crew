export const musicDirector = async ({ date, profile, library, passIds, count = 2 }, ctx) => {
  const { emit } = ctx
  emit('music_director', 'start', 'Looking through the teenage years for songs')
  const from = profile.birthYear + 13
  const to = profile.birthYear + 18
  const pool = library.filter((s) => Number(s.era) >= from && Number(s.era) <= to)
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000)
  const songs = []
  for (let i = 0; songs.length < Math.min(count, pool.length); i++) {
    const pick = pool[(day + i) % pool.length]
    if (!songs.some((s) => s.id === pick.id)) songs.push(pick)
  }
  emit('music_director', 'work', `Picked ${songs.map((s) => `${s.title} (${s.era})`).join(' and ')}`)
  emit('music_director', 'handoff', 'Songs and items go to the Scriptwriter', { to: 'scriptwriter', itemIds: passIds })
  emit('music_director', 'done', 'Song picks ready')
  return { songs, passIds }
}
