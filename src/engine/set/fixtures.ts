import { arrangement, full, SR, type Part } from '../analysis/arrangement'
import { frameFeatures } from '../analysis/structure'
import { grid } from '../test-helpers'
import { structureOn, type DjId, type TrackProfile } from './profile'

// Synthetic tracks for the set tests: an arrangement at 120 BPM, analysed on its own
// grid, then given the tempo the test needs (the structure does not depend on it).

export const SHAPES = {
  /** Long sparse intro and outro around a steady groove. */
  deep: [
    { bars: 16, kick: true, bass: false, hats: false },
    { bars: 48, ...full },
    { bars: 16, kick: true, bass: false, hats: false },
  ],
  /** The full groove arrives only after half of the track. */
  lift: [
    { bars: 8, kick: true, bass: false, hats: false },
    { bars: 24, kick: true, bass: true, hats: false },
    { bars: 8, kick: false, bass: false, hats: false },
    { bars: 8, kick: false, bass: false, hats: false, rise: true },
    { bars: 24, ...full },
    { bars: 8, kick: true, bass: false, hats: false },
  ],
  /** A breakdown and a return in the middle. */
  peak: [
    { bars: 16, kick: true, bass: false, hats: false },
    { bars: 16, ...full },
    { bars: 8, kick: false, bass: false, hats: false },
    { bars: 8, kick: false, bass: false, hats: false, rise: true },
    { bars: 16, ...full },
    { bars: 8, kick: true, bass: false, hats: false },
  ],
  /** Full from start to end. */
  tool: [{ bars: 40, ...full }],
} satisfies Record<string, Part[]>

const cache = new Map<string, ReturnType<typeof frameFeatures>>()

export function track(
  id: string,
  owner: DjId,
  shape: keyof typeof SHAPES,
  bpm: number,
): TrackProfile {
  let frames = cache.get(shape)
  if (!frames) {
    frames = frameFeatures([arrangement(SHAPES[shape])], SR)
    cache.set(shape, frames)
  }
  const { structure } = structureOn(frames, grid(120, 0), 'likely')
  return {
    id,
    owner,
    name: `${shape} ${id}`,
    durationSec: frames.total.length * frames.hopSec,
    grid: grid(bpm, 0),
    tempo: 'likely',
    structure,
  }
}
