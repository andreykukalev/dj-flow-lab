import { beatToSec, firstDownbeatSec, transitionBeatToDeckBeat } from '../time'
import { planTiming } from '../plan/loop'
import type { TrackProfile } from './profile'
import type { SetSheet } from './sheet'

// rekordbox XML export (#95): a playlist in set order, each track with its grid, a memory
// cue at the bar where the next track is started, a hot cue where it is itself cued when
// it comes in, and the transition notes in its comment. rekordbox finds a track by its
// file location, which a browser does not know: the DJ gives the folder the files are
// in on their computer, and each location is that folder and the file's name.
//
// Not checked yet against a real rekordbox: whether importing these cues leaves a DJ's
// own cues on the same tracks alone. Import into a new playlist and look first.

export interface ExportTrack {
  profile: TrackProfile
  fileName: string
}

const escape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // XML 1.0 has no place for most control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

/** `file://localhost/...` for a file in a folder, on macOS, Linux or Windows. */
export function fileLocation(folder: string, fileName: string): string {
  const parts = folder
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p !== '')
  const path = [...parts, fileName].map((p) => (/^[A-Za-z]:$/.test(p) ? p : encodeURIComponent(p)))
  return `file://localhost/${path.join('/')}`
}

const seconds = (s: number) => Math.max(0, s).toFixed(3)

/** Rekordbox's comment field, kept short: what happens with the tracks around this one. */
const MAX_COMMENT = 250

export function rekordboxXml(options: {
  playlist: string
  folder: string
  tracks: ExportTrack[]
  sheet: SetSheet
}): string {
  const { playlist, folder, tracks, sheet } = options
  const byId = new Map(tracks.map((t) => [t.profile.id, t]))
  const marks = new Map<string, string[]>()
  const notes = new Map<string, string[]>()
  const add = <T>(map: Map<string, T[]>, id: string, value: T) =>
    map.set(id, [...(map.get(id) ?? []), value])
  const name = (id: string) => byId.get(id)?.profile.name ?? id

  for (const t of sheet.transitions) {
    const v = t.version
    const n = t.index + 1
    if (!v || !t.cue) {
      add(notes, t.from, `→ ${name(t.to)}: no version yet`)
      continue
    }
    const timing = planTiming(v.plan)
    const playSecA = beatToSec(timing.gridA, transitionBeatToDeckBeat(timing, 'A', t.cue.playBeat))
    const cueBeatB = Math.max(0, transitionBeatToDeckBeat(timing, 'B', t.cue.playBeat))
    const cueSecB = beatToSec(timing.gridB, cueBeatB)
    add(
      marks,
      t.from,
      `<POSITION_MARK Name="${escape(`${n}: start ${name(t.to)}`)}" Type="0" Start="${seconds(playSecA)}" Num="-1"/>`,
    )
    add(
      marks,
      t.to,
      `<POSITION_MARK Name="${escape(`${n}: in from ${name(t.from)}`)}" Type="0" Start="${seconds(cueSecB)}" Num="0"/>`,
    )
    add(notes, t.from, `→ ${name(t.to)}: PLAY it on ${t.cue.playAt}`)
    add(notes, t.to, `← ${name(t.from)}: cued at ${t.cue.inAt}`)
  }

  const order = sheet.slots.map((s) => s.trackId).filter((id) => byId.has(id))
  const collection = order.map((id, k) => {
    const { profile: p, fileName } = byId.get(id)!
    const comment = (notes.get(id) ?? []).join('; ').slice(0, MAX_COMMENT)
    const attrs = [
      `TrackID="${k + 1}"`,
      `Name="${escape(p.name)}"`,
      `Kind="${escape(fileName.split('.').pop()?.toUpperCase() ?? '')} File"`,
      `TotalTime="${Math.round(p.durationSec)}"`,
      `AverageBpm="${p.grid.bpm.toFixed(2)}"`,
      ...(p.key ? [`Tonality="${escape(p.key)}"`] : []),
      `Comments="${escape(comment)}"`,
      `Location="${escape(fileLocation(folder, fileName))}"`,
    ]
    return [
      `    <TRACK ${attrs.join(' ')}>`,
      `      <TEMPO Inizio="${seconds(firstDownbeatSec(p.grid))}" Bpm="${p.grid.bpm.toFixed(2)}" Metro="4/4" Battito="1"/>`,
      ...(marks.get(id) ?? []).map((m) => `      ${m}`),
      `    </TRACK>`,
    ].join('\n')
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DJ_PLAYLISTS Version="1.0.0">',
    '  <PRODUCT Name="DJ Flow Lab" Version="0.1" Company=""/>',
    `  <COLLECTION Entries="${order.length}">`,
    ...collection,
    '  </COLLECTION>',
    '  <PLAYLISTS>',
    '    <NODE Type="0" Name="ROOT" Count="1">',
    `      <NODE Name="${escape(playlist)}" Type="1" KeyType="0" Entries="${order.length}">`,
    ...order.map((_, k) => `        <TRACK Key="${k + 1}"/>`),
    '      </NODE>',
    '    </NODE>',
    '  </PLAYLISTS>',
    '</DJ_PLAYLISTS>',
    '',
  ].join('\n')
}
