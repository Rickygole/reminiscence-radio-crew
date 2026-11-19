const PROMPT = 'You review one line of a radio show for an older listener with memory loss. Answer only with JSON like {"flag":false,"reason":""}. Set flag to true if the line gives medical or care advice, mentions medicine, quizzes memory, or could upset the listener.'

export const llm = (env = process.env) => ({
  available: () => Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_REGION && env.LLM_MODEL_ID),
  async review(text) {
    const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime')
    const client = new BedrockRuntimeClient({ region: env.AWS_REGION })
    const out = await client.send(
      new ConverseCommand({
        modelId: env.LLM_MODEL_ID,
        system: [{ text: PROMPT }],
        messages: [{ role: 'user', content: [{ text: `Line: ${text}` }] }],
        inferenceConfig: { maxTokens: 120, temperature: 0 }
      })
    )
    const raw = out.output?.message?.content?.[0]?.text ?? ''
    try {
      const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
      return { flag: parsed.flag === true, reason: String(parsed.reason ?? '').slice(0, 140) }
    } catch {
      return { flag: true, reason: 'Second reader answer could not be read' }
    }
  }
})
