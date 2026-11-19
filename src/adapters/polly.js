import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const ttsName = (text, voice) => `tts-${createHash('sha1').update(`${voice}|${text}`).digest('hex').slice(0, 16)}.mp3`

export const polly = (env = process.env) => {
  const voice = env.POLLY_VOICE || 'Matthew'
  return {
    available: () => Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_REGION),
    async synth(text, mediaDir) {
      const name = ttsName(text, voice)
      const file = join(mediaDir, name)
      if (!existsSync(file)) {
        const { PollyClient, SynthesizeSpeechCommand } = await import('@aws-sdk/client-polly')
        const client = new PollyClient({ region: env.AWS_REGION })
        const out = await client.send(new SynthesizeSpeechCommand({ Text: text, VoiceId: voice, Engine: 'neural', OutputFormat: 'mp3' }))
        mkdirSync(mediaDir, { recursive: true })
        writeFileSync(file, Buffer.from(await out.AudioStream.transformToByteArray()))
      }
      return { src: `media/${name}` }
    }
  }
}
