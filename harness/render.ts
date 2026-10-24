/** Browser-only helpers for rendering audio graphs offline. */

export function toBuffer(channels: Float32Array[], sampleRate: number): AudioBuffer {
  const length = Math.max(...channels.map((c) => c.length))
  const buffer = new AudioBuffer({ length, numberOfChannels: channels.length, sampleRate })
  channels.forEach((data, i) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, i))
  return buffer
}

export interface RenderOptions {
  sampleRate: number
  seconds: number
  channels?: number
}

/** Builds a graph on a fresh OfflineAudioContext, renders it, and returns each channel. */
export async function renderOffline(
  opts: RenderOptions,
  build: (ctx: OfflineAudioContext) => void | Promise<void>,
): Promise<Float32Array[]> {
  const channels = opts.channels ?? 1
  const ctx = new OfflineAudioContext(
    channels,
    Math.ceil(opts.seconds * opts.sampleRate),
    opts.sampleRate,
  )
  await build(ctx)
  const rendered = await ctx.startRendering()
  return Array.from({ length: channels }, (_, i) => rendered.getChannelData(i))
}
