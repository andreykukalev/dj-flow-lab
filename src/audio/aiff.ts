// AIFF and AIFF-C PCM decoder (D-03). Chromium and Firefox cannot decode AIFF with
// decodeAudioData, and DJs often keep their libraries in AIFF. Pure functions: bytes
// in, float channel data out.
//
// Supported: AIFF 8/16/24/32-bit integer; AIFF-C `NONE`/`twos` (big-endian integer),
// `sowt` (little-endian integer), `fl32`/`FL32`, `fl64`/`FL64`. Compressed AIFF-C
// (ima4, ulaw, alaw, …) is refused.

export interface DecodedPcm {
  sampleRate: number
  /** One array per channel, values in −1…1. */
  channels: Float32Array[]
  /** Frames per channel. */
  length: number
}

export class AiffError extends Error {
  override name = 'AiffError'
}

/** Whether the bytes start like an AIFF or AIFF-C file. */
export function isAiff(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 12) return false
  const v = new DataView(bytes)
  const form = fourCC(v, 8)
  return fourCC(v, 0) === 'FORM' && (form === 'AIFF' || form === 'AIFC')
}

type Encoding =
  { kind: 'int'; bits: number; littleEndian: boolean } | { kind: 'float'; bits: 32 | 64 }

export function decodeAiff(bytes: ArrayBuffer): DecodedPcm {
  if (!isAiff(bytes)) throw new AiffError('Not an AIFF file')
  const v = new DataView(bytes)
  const isAifc = fourCC(v, 8) === 'AIFC'
  const end = Math.min(bytes.byteLength, 8 + v.getUint32(4))

  let comm:
    | { channels: number; frames: number; bits: number; sampleRate: number; compression: string }
    | undefined
  let ssnd: { offset: number; size: number } | undefined
  for (let pos = 12; pos + 8 <= end;) {
    const id = fourCC(v, pos)
    const size = v.getUint32(pos + 4)
    const body = pos + 8
    if (id === 'COMM') {
      comm = {
        channels: v.getUint16(body),
        frames: v.getUint32(body + 2),
        bits: v.getUint16(body + 6),
        sampleRate: readExtended(v, body + 8),
        compression: isAifc ? fourCC(v, body + 18) : 'NONE',
      }
    } else if (id === 'SSND') {
      const dataOffset = v.getUint32(body)
      ssnd = { offset: body + 8 + dataOffset, size: size - 8 - dataOffset }
    }
    pos = body + size + (size & 1)
  }
  if (!comm) throw new AiffError('The file has no COMM chunk')
  if (!ssnd) throw new AiffError('The file has no sound data')
  const { channels, frames, sampleRate } = comm
  if (channels < 1 || !(sampleRate > 0)) throw new AiffError('Invalid channel count or sample rate')

  const encoding = encodingOf(comm.compression, comm.bits)
  const bytesPerSample = Math.ceil(encoding.bits / 8)
  const available = Math.floor(Math.max(0, ssnd.size) / (bytesPerSample * channels))
  const length = Math.min(frames, available)
  const out = Array.from({ length: channels }, () => new Float32Array(length))
  const read = sampleReader(v, encoding)
  let p = ssnd.offset
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      out[c]![i] = read(p)
      p += bytesPerSample
    }
  }
  return { sampleRate, channels: out, length }
}

function encodingOf(compression: string, bits: number): Encoding {
  switch (compression) {
    case 'NONE':
    case 'twos':
      if (bits < 1 || bits > 32) break
      return { kind: 'int', bits, littleEndian: false }
    case 'sowt':
      if (bits < 1 || bits > 32) break
      return { kind: 'int', bits, littleEndian: true }
    case 'fl32':
    case 'FL32':
      return { kind: 'float', bits: 32 }
    case 'fl64':
    case 'FL64':
      return { kind: 'float', bits: 64 }
  }
  throw new AiffError(`Unsupported AIFF-C compression "${compression}" (${bits}-bit)`)
}

function sampleReader(v: DataView, e: Encoding): (pos: number) => number {
  if (e.kind === 'float') {
    return e.bits === 32 ? (p) => v.getFloat32(p) : (p) => v.getFloat64(p)
  }
  const bytes = Math.ceil(e.bits / 8)
  const scale = 2 ** (bytes * 8 - 1)
  // Samples narrower than their container are left-justified, so reading the whole
  // container and scaling by its width gives the right value.
  if (bytes === 1) return (p) => v.getInt8(p) / scale
  if (bytes === 2) return (p) => v.getInt16(p, e.littleEndian) / scale
  if (bytes === 4) return (p) => v.getInt32(p, e.littleEndian) / scale
  return e.littleEndian
    ? (p) => ((v.getInt8(p + 2) << 16) | (v.getUint8(p + 1) << 8) | v.getUint8(p)) / scale
    : (p) => ((v.getInt8(p) << 16) | (v.getUint8(p + 1) << 8) | v.getUint8(p + 2)) / scale
}

function fourCC(v: DataView, pos: number): string {
  return String.fromCharCode(
    v.getUint8(pos),
    v.getUint8(pos + 1),
    v.getUint8(pos + 2),
    v.getUint8(pos + 3),
  )
}

/** 80-bit IEEE 754 extended precision, big-endian (the AIFF sample rate). */
export function readExtended(v: DataView, pos: number): number {
  const exp = v.getUint16(pos)
  const hi = v.getUint32(pos + 2)
  const lo = v.getUint32(pos + 6)
  const sign = exp & 0x8000 ? -1 : 1
  const e = exp & 0x7fff
  if (e === 0 && hi === 0 && lo === 0) return 0
  if (e === 0x7fff) return Number.NaN
  return sign * (hi * 2 ** (e - 16383 - 31) + lo * 2 ** (e - 16383 - 63))
}
