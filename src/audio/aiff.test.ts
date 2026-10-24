import { describe, expect, it } from 'vitest'
import { AiffError, decodeAiff, isAiff, readExtended } from './aiff'

// A small AIFF writer for building test files byte by byte.

function extended(rate: number): number[] {
  const e = Math.floor(Math.log2(rate))
  const mantissa = rate / 2 ** e // 1 ≤ m < 2
  const hi = Math.floor(mantissa * 2 ** 31)
  const lo = Math.round((mantissa * 2 ** 31 - hi) * 2 ** 32)
  const exp = e + 16383
  return [exp >> 8, exp & 255, ...u32(hi), ...u32(lo)]
}
const u16 = (n: number) => [(n >> 8) & 255, n & 255]
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

function chunk(id: string, body: number[]): number[] {
  return [...ascii(id), ...u32(body.length), ...body, ...(body.length & 1 ? [0] : [])]
}

interface WriteOptions {
  form?: 'AIFF' | 'AIFC'
  compression?: string
  bits: number
  sampleRate?: number
  channels: number[][]
  encode: (value: number) => number[]
  extraChunks?: number[][]
  ssndOffset?: number
  truncate?: number
}

function writeAiff(o: WriteOptions): ArrayBuffer {
  const frames = o.channels[0]!.length
  const form = o.form ?? 'AIFF'
  const comm = [
    ...u16(o.channels.length),
    ...u32(frames),
    ...u16(o.bits),
    ...extended(o.sampleRate ?? 44100),
    ...(form === 'AIFC' ? [...ascii(o.compression ?? 'NONE'), 0] : []),
  ]
  const data: number[] = []
  for (let i = 0; i < frames; i++) for (const ch of o.channels) data.push(...o.encode(ch[i]!))
  const offset = o.ssndOffset ?? 0
  const ssnd = [...u32(offset), ...u32(0), ...new Array(offset).fill(0), ...data]
  const body = [
    ...ascii(form),
    ...(o.extraChunks ?? []).flat(),
    ...chunk('COMM', comm),
    ...chunk('SSND', ssnd.slice(0, ssnd.length - (o.truncate ?? 0))),
  ]
  return new Uint8Array([...ascii('FORM'), ...u32(body.length), ...body]).buffer
}

/** Two's complement integer of `bits`, scaled like the decoder (full scale 2^(bits−1)). */
const int = (x: number, bits: number) => {
  const full = 2 ** (bits - 1)
  return Math.max(-full, Math.min(full - 1, Math.round(x * full)))
}
const be16 = (x: number) => u16(int(x, 16) & 0xffff)
const le16 = (x: number) => be16(x).reverse()
const be24 = (x: number) => {
  const n = int(x, 24) & 0xffffff
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const le24 = (x: number) => be24(x).reverse()
const be32 = (x: number) => u32(int(x, 32) >>> 0)
const f32 = (x: number) => [...new Uint8Array(new Float32Array([x]).buffer)].reverse()
const f64 = (x: number) => [...new Uint8Array(new Float64Array([x]).buffer)].reverse()

const left = [0, 0.5, -0.5, 0.25, -1, 0.999]
const right = [0.1, -0.1, 0.75, -0.75, 0, 0.3]

describe('AIFF decoding', () => {
  it.each([
    ['16-bit', 16, be16, 2 ** -15],
    ['24-bit', 24, be24, 2 ** -23],
    ['32-bit', 32, be32, 2 ** -24], // limited by Float32 output,
  ] as const)('decodes %s big-endian stereo', (_, bits, encode, lsb) => {
    const r = decodeAiff(writeAiff({ bits, channels: [left, right], encode }))
    expect(r.sampleRate).toBe(44100)
    expect(r.length).toBe(6)
    expect(r.channels).toHaveLength(2)
    r.channels[0]!.forEach((v, i) => expect(Math.abs(v - left[i]!)).toBeLessThanOrEqual(lsb * 1.01))
    r.channels[1]!.forEach((v, i) =>
      expect(Math.abs(v - right[i]!)).toBeLessThanOrEqual(lsb * 1.01),
    )
  })

  it('decodes 8-bit signed and mono files', () => {
    const r = decodeAiff(
      writeAiff({ bits: 8, channels: [[0, 0.5, -1]], encode: (x) => [int(x, 8) & 255] }),
    )
    expect(r.channels).toHaveLength(1)
    expect([...r.channels[0]!].map((v) => Math.round(v * 128))).toEqual([0, 64, -128])
  })

  it.each([
    ['sowt 16-bit', 'sowt', 16, le16, 2 ** -15],
    ['sowt 24-bit', 'sowt', 24, le24, 2 ** -23],
    ['twos 16-bit', 'twos', 16, be16, 2 ** -15],
    ['NONE 24-bit', 'NONE', 24, be24, 2 ** -23],
    ['fl32', 'fl32', 32, f32, 1e-7],
    ['FL32', 'FL32', 32, f32, 1e-7],
    ['fl64', 'fl64', 64, f64, 1e-7],
  ] as const)('decodes AIFF-C %s', (_, compression, bits, encode, tol) => {
    const r = decodeAiff(
      writeAiff({ form: 'AIFC', compression, bits, channels: [left, right], encode }),
    )
    r.channels[0]!.forEach((v, i) => expect(Math.abs(v - left[i]!)).toBeLessThanOrEqual(tol * 1.01))
    r.channels[1]!.forEach((v, i) =>
      expect(Math.abs(v - right[i]!)).toBeLessThanOrEqual(tol * 1.01),
    )
  })

  it('reads common sample rates from the 80-bit field', () => {
    for (const rate of [8000, 22050, 44100, 48000, 88200, 96000, 192000]) {
      expect(
        decodeAiff(writeAiff({ bits: 16, sampleRate: rate, channels: [[0]], encode: be16 }))
          .sampleRate,
      ).toBe(rate)
    }
    expect(readExtended(new DataView(new ArrayBuffer(10)), 0)).toBe(0)
  })

  it('skips other chunks, including odd-sized ones, and honours the SSND offset', () => {
    const r = decodeAiff(
      writeAiff({
        bits: 16,
        channels: [left],
        encode: be16,
        extraChunks: [chunk('NAME', ascii('abc')), chunk('ANNO', ascii('hello'))],
        ssndOffset: 4,
      }),
    )
    expect(r.channels[0]![1]).toBeCloseTo(0.5, 4)
  })

  it('keeps the frames that are present in a truncated file', () => {
    const r = decodeAiff(
      writeAiff({ bits: 16, channels: [left, right], encode: be16, truncate: 5 }),
    )
    expect(r.length).toBe(4)
  })

  it('refuses compressed AIFF-C and files that are not AIFF', () => {
    const ima = writeAiff({
      form: 'AIFC',
      compression: 'ima4',
      bits: 16,
      channels: [left],
      encode: be16,
    })
    expect(() => decodeAiff(ima)).toThrow(AiffError)
    expect(() => decodeAiff(ima)).toThrow(/ima4/)
    const wav = new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')]).buffer
    expect(isAiff(wav)).toBe(false)
    expect(() => decodeAiff(wav)).toThrow('Not an AIFF file')
  })
})
