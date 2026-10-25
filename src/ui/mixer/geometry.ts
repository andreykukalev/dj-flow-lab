import { controlSpec, type ControlKey } from '../../engine/mixer'

// Drawing geometry of the virtual mixer (mockup iPad 4). Pure functions from control
// positions to SVG attribute values, so the per-frame renderer only writes strings.

/** Knob sweep: 270°, from −135° (minimum, lower left) to +135° (maximum, lower right). */
export const KNOB_SWEEP_DEG = 270
export const KNOB_SIZE = 48
const C = KNOB_SIZE / 2
export const KNOB_ARC_R = 19

/** Position of a control as 0…1 of its range. */
export function unitOf(key: ControlKey, value: number): number {
  const { min, max } = controlSpec(key)
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

/** Pointer angle in degrees, 0 = straight up, clockwise positive. */
export function knobAngle(unit: number): number {
  return -KNOB_SWEEP_DEG / 2 + KNOB_SWEEP_DEG * unit
}

/** A point at `r` from the knob centre, at `deg` (0 = up, clockwise). */
export function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [C + r * Math.sin(a), C - r * Math.cos(a)]
}

const f = (n: number) => n.toFixed(2)

/** Arc on the knob's track from angle `fromDeg` to `toDeg`; empty when they are equal. */
export function arcPath(fromDeg: number, toDeg: number, r = KNOB_ARC_R): string {
  if (Math.abs(toDeg - fromDeg) < 0.01) return ''
  const [x0, y0] = polar(r, fromDeg)
  const [x1, y1] = polar(r, toDeg)
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0
  const sweep = toDeg > fromDeg ? 1 : 0
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${large} ${sweep} ${f(x1)} ${f(y1)}`
}

/** The full track of a knob. */
export const KNOB_TRACK = arcPath(-KNOB_SWEEP_DEG / 2, KNOB_SWEEP_DEG / 2)

/** A radial line from `r0` to `r1` at `deg`: the pointer and the target tick. */
export function radialPath(deg: number, r0: number, r1: number): string {
  const [x0, y0] = polar(r0, deg)
  const [x1, y1] = polar(r1, deg)
  return `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`
}

/** Value arc: from the control's neutral position (its default) to its current one. */
export function valueArc(key: ControlKey, value: number): string {
  return arcPath(knobAngle(unitOf(key, controlSpec(key).default)), knobAngle(unitOf(key, value)))
}

export function pointerPath(key: ControlKey, value: number): string {
  return radialPath(knobAngle(unitOf(key, value)), 0, 12)
}

export function tickPath(key: ControlKey, value: number): string {
  return radialPath(knobAngle(unitOf(key, value)), 17.5, 22.5)
}

/** Fader track length in px; the cap's centre travels the whole length. */
export const FADER_LENGTH = 168
/** Crossfader track width and cap width in px. */
export const CROSSFADER_WIDTH = 150
export const CROSSFADER_CAP = 28

/** Distance of the fader cap's centre from the top of the track. */
export function faderCapY(value: number): number {
  return (1 - Math.min(1, Math.max(0, value))) * FADER_LENGTH
}

/** Left edge of the crossfader cap. */
export function crossfaderCapX(value: number): number {
  return Math.min(1, Math.max(0, value)) * (CROSSFADER_WIDTH - CROSSFADER_CAP)
}
