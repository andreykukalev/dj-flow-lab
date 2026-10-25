import { CONTROL_KEYS, type ControlKey, type ControlState } from '../../engine/mixer'
import { crossfaderCapX, faderCapY, pointerPath, tickPath, valueArc } from './geometry'

// Writes the mixer's state straight into the DOM that <Mixer> rendered once (D-21:
// React is not on the per-frame path). Each control's element carries the value it
// shows in `data-value`, which the frame logger reads back for P7.

export interface UpcomingMark {
  /** Position the control will move to. */
  to: number
  caption: string
}

export type UpcomingMarks = Partial<Record<ControlKey, UpcomingMark>>

interface ControlElements {
  root: HTMLElement
  kind: 'knob' | 'fader' | 'crossfader'
  arc?: SVGPathElement | null
  pointer?: SVGPathElement | null
  tick?: SVGPathElement | null
  fill?: HTMLElement | null
  cap?: HTMLElement | null
  caption?: HTMLElement | null
}

export class MixerRenderer {
  private readonly controls = new Map<ControlKey, ControlElements>()
  /** Last strings written, per element and attribute, so unchanged values cost nothing. */
  private readonly written = new Map<string, string>()

  constructor(root: HTMLElement) {
    for (const key of CONTROL_KEYS) {
      const el = root.querySelector<HTMLElement>(`[data-control="${key}"]`)
      if (!el) throw new Error(`Mixer has no element for ${key}`)
      const part = <T extends Element>(name: string) => el.querySelector<T>(`[data-part="${name}"]`)
      this.controls.set(key, {
        root: el,
        kind: el.dataset.kind as ControlElements['kind'],
        arc: part('arc'),
        pointer: part('pointer'),
        tick: part('tick'),
        fill: part('fill'),
        cap: part('cap'),
        caption: part('caption'),
      })
    }
  }

  render(state: ControlState, upcoming: UpcomingMarks = {}): void {
    for (const [key, el] of this.controls) {
      const value = state[key]
      const mark = upcoming[key]
      this.set(el.root, key, 'data-value', String(value))
      this.set(el.root, key, 'data-upcoming', mark ? 'true' : 'false')
      if (el.caption) this.text(el.caption, key, mark?.caption ?? '')
      if (el.kind === 'knob') {
        if (el.arc) this.set(el.arc, key, 'd', valueArc(key, value))
        if (el.pointer) this.set(el.pointer, key, 'd', pointerPath(key, value))
        if (el.tick) this.set(el.tick, key, 'd', mark ? tickPath(key, mark.to) : '')
      } else if (el.kind === 'fader') {
        const y = faderCapY(value)
        if (el.fill) this.style(el.fill, key, 'height', `${(100 * value).toFixed(2)}%`)
        if (el.cap) this.style(el.cap, key, 'transform', `translateY(${y.toFixed(2)}px)`)
      } else if (el.cap) {
        this.style(el.cap, key, 'transform', `translateX(${crossfaderCapX(value).toFixed(2)}px)`)
      }
    }
  }

  /** The values the DOM shows now, read back from `data-value`. */
  readBack(): ControlState {
    const state = {} as ControlState
    for (const [key, el] of this.controls) state[key] = Number(el.root.dataset.value)
    return state
  }

  private changed(key: ControlKey, slot: string, value: string): boolean {
    const id = `${key}|${slot}`
    if (this.written.get(id) === value) return false
    this.written.set(id, value)
    return true
  }

  private set(el: Element, key: ControlKey, attr: string, value: string): void {
    if (this.changed(key, `${el.getAttribute('data-part') ?? 'root'}.${attr}`, value)) {
      el.setAttribute(attr, value)
    }
  }

  private style(el: HTMLElement, key: ControlKey, prop: 'height' | 'transform', value: string) {
    if (this.changed(key, `${el.dataset.part}.style.${prop}`, value)) el.style[prop] = value
  }

  private text(el: HTMLElement, key: ControlKey, value: string): void {
    if (this.changed(key, 'caption.text', value)) el.textContent = value
  }
}
