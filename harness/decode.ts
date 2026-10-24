// Decoding matrix for spike S2 (#43): which fixture files each engine decodes natively,
// what the AIFF fallback gives, and where each file's first onset lands.
import { decodeAiff, isAiff } from '../src/audio/aiff'
import { onsets } from './measure'

export const FIXTURES = [
  'wav_s16.wav',
  'wav_s24.wav',
  'wav_f32.wav',
  'aiff_s16.aiff',
  'aiff_s24.aiff',
  'aiff_s32.aiff',
  'aiff_s16_mono.aiff',
  'aifc_sowt.aifc',
  'aifc_fl32.aifc',
  'aifc_fl64.aifc',
  'flac.flac',
  'mp3_lame.mp3',
  'mp3_lame_noheader.mp3',
  'mp3_shine.mp3',
  'aac.m4a',
  'alac.m4a',
  'vorbis.ogg',
  'opus.opus',
] as const

export type Fixture = (typeof FIXTURES)[number]

/** Lossless fixtures and the WAV they must match sample for sample. */
export const LOSSLESS_REFERENCE: Partial<Record<Fixture, Fixture>> = {
  'aiff_s16.aiff': 'wav_s16.wav',
  'aifc_sowt.aifc': 'wav_s16.wav',
  'aiff_s24.aiff': 'wav_s24.wav',
  'aiff_s32.aiff': 'wav_f32.wav',
  'aifc_fl32.aifc': 'wav_f32.wav',
  'aifc_fl64.aifc': 'wav_f32.wav',
  'flac.flac': 'wav_s24.wav', // ffmpeg writes 24-bit FLAC from the float source
  'alac.m4a': 'wav_s24.wav',
}

const SAMPLE_RATE = 44100
/** The fixtures' pulses are at 100 ms and 350 ms, 0.8 peak. */
const ONSET_THRESHOLD = 0.2

export interface DecodeRow {
  file: Fixture
  /** 'ok' or the error name from decodeAudioData. */
  native: string
  /** For AIFF files that fail natively: 'ok' or the error message of our parser. */
  fallback?: string
  decodedBy?: 'native' | 'fallback'
  frames?: number
  channels?: number
  /** Context time of the first and second onsets on the left channel, ms. */
  onsetsMs?: number[]
  /** Left channel carries the 440 Hz tone and right the 660 Hz one. */
  channelOrderOk?: boolean
  /** Largest sample difference from the lossless reference, when there is one. */
  maxDiffFromReference?: number
}

async function fetchBytes(file: string): Promise<ArrayBuffer> {
  const res = await fetch(`/tests/fixtures/decode/${file}`)
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  return res.arrayBuffer()
}

async function nativeDecode(bytes: ArrayBuffer): Promise<Float32Array[]> {
  // decodeAudioData resamples to the context's rate; the fixtures are 44.1 kHz (Opus 48 kHz).
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE)
  const buffer = await ctx.decodeAudioData(bytes)
  return Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
}

/** Magnitude of one frequency in a signal (single-bin DFT). */
function tone(data: Float32Array, hz: number): number {
  const w = (2 * Math.PI * hz) / SAMPLE_RATE
  let re = 0
  let im = 0
  for (let i = 0; i < data.length; i++) {
    re += data[i]! * Math.cos(w * i)
    im += data[i]! * Math.sin(w * i)
  }
  return Math.hypot(re, im)
}

function maxDiff(a: Float32Array[], b: Float32Array[]): number {
  if (a.length !== b.length) return Infinity
  let max = 0
  a.forEach((ch, c) => {
    const other = b[c]!
    if (ch.length !== other.length) max = Infinity
    else for (let i = 0; i < ch.length; i++) max = Math.max(max, Math.abs(ch[i]! - other[i]!))
  })
  return max
}

export async function decodeMatrix(): Promise<DecodeRow[]> {
  const decoded = new Map<Fixture, Float32Array[]>()
  const rows: DecodeRow[] = []
  for (const file of FIXTURES) {
    const bytes = await fetchBytes(file)
    const row: DecodeRow = { file, native: 'ok' }
    let channels: Float32Array[] | undefined
    try {
      // decodeAudioData detaches the buffer it is given, so pass a copy.
      channels = await nativeDecode(bytes.slice(0))
      row.decodedBy = 'native'
    } catch (e) {
      row.native = e instanceof Error ? e.name : String(e)
      if (isAiff(bytes)) {
        try {
          const pcm = decodeAiff(bytes)
          if (pcm.sampleRate !== SAMPLE_RATE) throw new Error('unexpected sample rate')
          channels = pcm.channels
          row.fallback = 'ok'
          row.decodedBy = 'fallback'
        } catch (err) {
          row.fallback = err instanceof Error ? err.message : String(err)
        }
      }
    }
    if (channels) {
      decoded.set(file, channels)
      const left = channels[0]!
      row.frames = left.length
      row.channels = channels.length
      row.onsetsMs = onsets(left.map(Math.abs), ONSET_THRESHOLD, 2000).map(
        (s) => (s / SAMPLE_RATE) * 1000,
      )
      if (channels.length === 2) {
        const right = channels[1]!
        row.channelOrderOk =
          tone(left, 440) > tone(left, 660) && tone(right, 660) > tone(right, 440)
      }
    }
    rows.push(row)
  }
  for (const row of rows) {
    const ref = LOSSLESS_REFERENCE[row.file]
    const a = decoded.get(row.file)
    const b = ref && decoded.get(ref)
    if (a && b) row.maxDiffFromReference = maxDiff(a, b)
  }
  return rows
}
