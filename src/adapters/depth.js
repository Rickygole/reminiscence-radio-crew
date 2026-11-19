export const depth = (env = process.env) => ({
  available: () => env.DEPTH === '1',
  async estimate(inputPath, outputPath) {
    const { pipeline } = await import('@huggingface/transformers')
    const estimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small')
    const out = await estimator(inputPath)
    await out.depth.save(outputPath)
  }
})
