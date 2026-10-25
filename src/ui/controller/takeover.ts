import type { Transport } from '../../audio/transport'
import { controlSpec, type ControlKey } from '../../engine/mixer'
import { simplifyTake, type Take, type TakePoint } from '../../engine/plan/take'
import { CROSSFADER_WIDTH, FADER_LENGTH } from '../mixer/geometry'
import type { ControllerLoop } from './loop'

// Taking over a control while the plan plays (#68). Pointer gestures on the mixer
// move the held control's audio parameter directly; the loop shows it where the hand
// puts it; each frame and each move is recorded at the beat being rendered, and on
// release the recording becomes a take.

/** Vertical drag, in pixels, that turns a knob through its whole range. */
export const KNOB_DRAG_PX = 160

export interface TakeOverOptions {
  /** A finished take, or null when the control was let go without moving it. */
  onTake: (take: Take | null) => void
  /** Called when the user tries to grab a control while nothing plays. */
  onIdleGrab?: (key: ControlKey) => void
}

interface Hold {
  key: ControlKey
  el: HTMLElement
  pointerId: number
  kind: string
  startX: number
  startY: number
  startValue: number
  value: number
  points: TakePoint[]
  offFrame: () => void
}

let takeCount = 0

export class TakeOver {
  private hold: Hold | null = null
  private readonly root: HTMLElement
  private readonly transport: Transport
  private readonly loop: ControllerLoop
  private readonly options: TakeOverOptions
  private readonly offTransport: () => void

  constructor(
    root: HTMLElement,
    transport: Transport,
    loop: ControllerLoop,
    options: TakeOverOptions,
  ) {
    this.root = root
    this.transport = transport
    this.loop = loop
    this.options = options
    root.dataset.takeover = 'true'
    root.addEventListener('pointerdown', this.down)
    root.addEventListener('pointermove', this.move)
    root.addEventListener('pointerup', this.up)
    root.addEventListener('pointercancel', this.up)
    root.addEventListener('lostpointercapture', this.up)
    // Pausing, seeking or replaying ends a take where it is.
    this.offTransport = transport.subscribe(() => this.finish())
  }

  get holding(): ControlKey | null {
    return this.hold?.key ?? null
  }

  dispose(): void {
    this.finish()
    this.offTransport()
    delete this.root.dataset.takeover
    this.root.removeEventListener('pointerdown', this.down)
    this.root.removeEventListener('pointermove', this.move)
    this.root.removeEventListener('pointerup', this.up)
    this.root.removeEventListener('pointercancel', this.up)
    this.root.removeEventListener('lostpointercapture', this.up)
  }

  private record(value: number): void {
    this.hold?.points.push({ beat: this.transport.beatAt(), value })
  }

  private readonly down = (e: PointerEvent) => {
    if (this.hold || e.button !== 0) return
    const el = (e.target as Element).closest<HTMLElement>('[data-control]')
    if (!el || !this.root.contains(el)) return
    const key = el.dataset.control as ControlKey
    if (this.transport.state.kind !== 'playing') {
      this.options.onIdleGrab?.(key)
      return
    }
    e.preventDefault()
    el.setPointerCapture(e.pointerId)
    const value = Number(el.dataset.value)
    this.transport.hold(key, value)
    this.loop.setOverride(key, value)
    el.dataset.held = 'true'
    this.hold = {
      key,
      el,
      pointerId: e.pointerId,
      kind: el.dataset.kind ?? 'knob',
      startX: e.clientX,
      startY: e.clientY,
      startValue: value,
      value,
      points: [],
      offFrame: this.loop.onFrame(() => this.record(this.hold?.value ?? value)),
    }
    this.record(value)
  }

  private readonly move = (e: PointerEvent) => {
    const h = this.hold
    if (!h || e.pointerId !== h.pointerId) return
    const { min, max } = controlSpec(h.key)
    const range = max - min
    const dx = e.clientX - h.startX
    const dy = e.clientY - h.startY
    const delta =
      h.kind === 'crossfader'
        ? (dx / CROSSFADER_WIDTH) * range
        : h.kind === 'fader'
          ? (-dy / FADER_LENGTH) * range
          : (-dy / KNOB_DRAG_PX) * range
    h.value = Math.min(max, Math.max(min, h.startValue + delta))
    this.transport.move(h.key, h.value)
    this.loop.setOverride(h.key, h.value)
    this.record(h.value)
  }

  private readonly up = (e: PointerEvent) => {
    if (this.hold && e.pointerId === this.hold.pointerId) this.finish()
  }

  /** Ends the current hold, if any, and hands the recording over as a take. */
  private finish(): void {
    const h = this.hold
    if (!h) return
    this.hold = null
    h.offFrame()
    delete h.el.dataset.held
    if (h.el.hasPointerCapture(h.pointerId)) h.el.releasePointerCapture(h.pointerId)
    this.transport.release(h.key)
    this.loop.setOverride(h.key, undefined)
    const points = simplifyTake(h.points)
    const moved = points.some((p) => Math.abs(p.value - h.startValue) > 1e-6)
    this.options.onTake(
      points.length >= 2 && moved ? { id: `take-${++takeCount}`, control: h.key, points } : null,
    )
  }
}
