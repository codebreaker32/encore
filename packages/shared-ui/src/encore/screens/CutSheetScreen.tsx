import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  PERSONAS,
  cutSheet,
  getVenue,
  ledgerRows,
  measuredNext,
  type CutFrame,
  type McUnavailableReason,
  type SetRecord,
  type SetState,
  type VenueId,
} from '@strumble/crowd';
import { config as appConfig } from '../config';
import { reasonInWords, type DebriefStatus } from '../useMc';
import { clipCount, clipFor, type ClipKind } from '../world/clips';
import { Gradient } from '../world/Gradient';
import { Plate } from '../world/Plate';
import { plateSource } from '../world/plates';
import { colors, display, dsp, edge, mmss, sp, tabular, text, up } from '../world/theme';
import { PERSONA_TRAIT } from './BillScreen';

/** The one sentence that stands in the MC block's place when the model did not answer. Not the MC's voice: the screen's. */
export function silentSentence(reason: McUnavailableReason): string {
  const head =
    reason === 'rejected'
      ? "The MC's answer was withheld"
      : reason === 'model-error'
        ? "The MC didn't answer"
        : "The MC couldn't be reached";
  return `${head} (${reasonInWords(reason)}).`;
}

export function nextWords(next: 'again' | 'up' | 'down'): string {
  return next === 'up' ? 'go up a room' : next === 'down' ? 'go down a room' : 'go again here';
}

/** The house rule for the next room, as a measurement (not MC prose): see `measuredNext` in @strumble/crowd. */
export { measuredNext };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Diagonal stripes from stacked Views: the cut sheet's dead-air frame. */
function Stripes() {
  const bars: React.ReactNode[] = [];
  for (let i = 0; i < 40; i++)
    bars.push(<View key={i} style={{ width: sp(10), backgroundColor: i % 2 ? colors.deadA : colors.deadB }} />);
  return (
    <View style={styles.stripes} pointerEvents="none">
      <View style={styles.stripeSquare}>{bars}</View>
    </View>
  );
}

/** Cuts and dead air get at least this share of the strip: "LAUGH 0:22" fits on one line at 24 px. */
const MIN_SHARE = 0.09;
/** Frames narrower than this still carry a short label (a cut's time, nothing on a wide). */
const NARROW = MIN_SHARE * 0.9;
/** The strip stays readable at ~12 frames: shorter wides merge into their neighbours. */
const MAX_FRAMES = 12;

/** Merge consecutive wides, then the shortest inner wides into the frame before them, until the strip is ~MAX_FRAMES. */
export function condense(input: CutFrame[]): CutFrame[] {
  let frames = input.map((f) => ({ ...f }));
  const mergeConsecutiveWides = () => {
    const out: CutFrame[] = [];
    for (const f of frames) {
      const prev = out.length ? out[out.length - 1] : undefined;
      if (prev && prev.kind === 'wide' && f.kind === 'wide' && prev.to === f.from) prev.to = f.to;
      else out.push(f);
    }
    frames = out;
  };
  mergeConsecutiveWides();
  while (frames.length > MAX_FRAMES) {
    let shortest = -1;
    for (let i = 1; i < frames.length - 1; i++) {
      const f = frames[i];
      if (f.kind !== 'wide') continue;
      if (shortest < 0 || f.to - f.from < frames[shortest].to - frames[shortest].from) shortest = i;
    }
    if (shortest < 0) break;
    frames[shortest - 1].to = frames[shortest].to;
    frames.splice(shortest, 1);
    mergeConsecutiveWides();
  }
  return frames;
}

function frameLabel(f: CutFrame, i: number, share: number): string {
  if (f.kind === 'finale') return share < MIN_SHARE * 1.5 ? 'close' : 'close · applause';
  if (f.kind === 'wide' && i === 0) return share < NARROW ? 'open' : 'open · wide';
  if (f.kind === 'reaction') {
    // The engine's label starts "laugh 0:41"; the strip shows that, or the time alone when the frame is narrow.
    const m = f.label.match(/^(\S+)\s+(\d+:\d\d)/);
    const noun = m ? m[1] : f.label;
    const time = m ? m[2] : mmss(f.from);
    return share < NARROW ? time : `${noun} ${time}`;
  }
  if (f.kind === 'dead') return share < NARROW ? f.label.replace(/^dead\s+/, '') : f.label;
  return share < NARROW ? '' : f.label;
}

/**
 * The cut sheet: the set as an edit timeline of shots, the measured numbers beneath, the MC's note in character.
 * Thumbnails reuse the venue's first wide, first reaction and finale plates (three decodes, plus the darkened room behind).
 */
export function CutSheetScreen({
  state,
  record,
  mc,
  setNumber,
  nextVenue,
  stage = false,
  stageThumbs,
}: {
  state: SetState;
  record: SetRecord;
  /** The MC's debrief: being written, the model's note, or silence with its reason. */
  mc: DebriefStatus;
  setNumber: number;
  nextVenue: VenueId;
  /** The live 3D room is behind this screen (emptying after the set): darkened as the photograph was. */
  stage?: boolean;
  /** With the stage: frames of this set's room, snapshotted on each cut (by the time their shot started). */
  stageThumbs?: { at: number; uri: string }[];
}) {
  const { venue, pack, config } = state;
  const frames = condense(cutSheet(state));
  const total = Math.max(1, state.now);
  const rows = ledgerRows(record);
  const next = getVenue(config.act, nextVenue);
  const wide = venue.plates.wide[0] || '';
  // Thumbnails show the lifted still of the clip the director actually cut to (the angle at that time, same mapping as
  // the live screen: singing's own angles, poetry-reaction-1 at the open mic, else the venue's), or the pack's plate.
  // Over the 3D room the strip shows that room: the snapshot taken during the frame, or nothing (never a stock photo).
  const stageThumb = (f: CutFrame) => {
    const shot = (stageThumbs || []).find((t) => t.at >= f.from - 0.05 && t.at < f.to);
    return shot ? { uri: shot.uri } : null;
  };
  const thumb = (f: CutFrame) => {
    const kind: ClipKind = f.kind === 'reaction' ? 'reaction' : f.kind === 'finale' ? 'finale' : 'wide';
    const list =
      kind === 'reaction' ? venue.plates.reaction : kind === 'finale' ? venue.plates.finale : venue.plates.wide;
    const n = Math.max(0, list.indexOf(f.plate || '')) + 1;
    const clip =
      config.act === 'singing' && n <= clipCount('singing', kind)
        ? clipFor('singing', kind, n)
        : config.act === 'poetry' && config.venue === 'openmic' && kind === 'reaction' && n <= clipCount('poetry', kind)
          ? clipFor('poetry', kind, n)
          : clipFor(config.venue, kind, n);
    return clip ? clip.thumb : plateSource(f.plate || list[0] || wide);
  };
  const ticks: number[] = [];
  for (let t = 0; t < total; t += 60) ticks.push(t);
  ticks.push(total);
  /**
   * Cuts and dead air get MIN_SHARE of the finished strip each; wides share the rest by duration.
   * With k frames at the minimum m and the others summing to R: m = MIN_SHARE · (R + k·m), so m = MIN_SHARE·R / (1 − MIN_SHARE·k).
   * k depends on m (a long cut keeps its own length), so solve twice.
   */
  let minFlex = total * MIN_SHARE;
  const natural = (f: CutFrame) => (f.kind === 'wide' ? Math.max(0.5, f.to - f.from) : f.to - f.from);
  for (let pass = 0; pass < 3; pass++) {
    const atMin = frames.filter((f) => f.kind !== 'wide' && natural(f) < minFlex);
    const rest = frames.reduce((n, f) => n + (atMin.indexOf(f) >= 0 ? 0 : natural(f)), 0);
    minFlex = (MIN_SHARE * rest) / Math.max(0.05, 1 - MIN_SHARE * atMin.length);
  }
  const flexOf = (f: CutFrame) => (f.kind === 'wide' ? natural(f) : Math.max(natural(f), minFlex));
  const totalFlex = frames.reduce((n, f) => n + flexOf(f), 0);

  return (
    <View style={[styles.root, stage && styles.onStage]}>
      {stage ? <View style={styles.darken} /> : <Plate id={wide} grade="flat" darken={0.74} grainOpacity={0.1} />}
      {stage ? (
        // The room keeps moving after the set, and people walked behind the ledger (QA 2026-10-12): below the strip the
        // house closes in further, so the numbers and the MC's words read; the strip's own room stays as it was.
        <Gradient
          style={styles.ledgerScrim}
          stops={[
            { at: 0, alpha: 0 },
            { at: 0.16, alpha: 0.6 },
            { at: 1, alpha: 0.7 },
          ]}
        />
      ) : null}
      <View style={styles.head}>
        <Text style={styles.title}>{up('Cut sheet')}</Text>
        <Text style={styles.sub}>
          Set {setNumber} · {venue.house}, {venue.name} · {mmss(state.now)} · {dayLabel(record.endedAt)} · the same
          numbers at every venue
        </Text>
      </View>

      <View style={styles.strip}>
        <Text style={styles.lab}>
          Your {pack.unit}, shot by shot. Gold cuts are {pack.reaction.plural} the room gave you; a striped one is dead
          air past {state.venue.patienceSec.toFixed(1)} s.
        </Text>
        <View style={styles.frames}>
          {frames.map((f, i) => {
            const flex = flexOf(f);
            const share = flex / totalFlex;
            const source = stage ? stageThumb(f) : thumb(f);
            return (
              <View key={`${f.kind}-${f.from}`} style={[styles.frame, { flex }, i > 0 && styles.frameGap]}>
                {f.kind === 'dead' ? (
                  <Stripes />
                ) : source ? (
                  <Image source={source} resizeMode="cover" fadeDuration={0} style={styles.frameImage} />
                ) : null}
                <Text
                  style={[
                    styles.tag,
                    share < NARROW && styles.tagNarrow,
                    f.kind === 'reaction' && styles.tagGold,
                    f.kind === 'dead' && styles.tagDead,
                  ]}
                  numberOfLines={1}
                >
                  {up(frameLabel(f, i, share))}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={styles.ticks}>
          {ticks.map((t, i) =>
            i === ticks.length - 1 ? (
              <Text key={t} style={[styles.tick, styles.tickEnd]}>
                {mmss(t)}
              </Text>
            ) : (
              <Text key={t} style={[styles.tick, { left: `${(100 * t) / total}%` }]}>
                {mmss(t)}
              </Text>
            ),
          )}
        </View>
      </View>

      <View style={styles.ledger}>
        <Text style={styles.lab}>Measured, not judged</Text>
        {rows.map((r) => (
          <View key={r.k} style={styles.ledgerRow}>
            <Text
              style={[styles.n, r.measured && r.good && styles.nGood, !r.measured && styles.nNone]}
              numberOfLines={1}
            >
              {r.n}
            </Text>
            <Text style={styles.k}>{r.k}</Text>
            <Text style={styles.v}>{r.v}</Text>
          </View>
        ))}
      </View>

      <View style={styles.mc}>
        <Text style={styles.who}>
          {up(`Your MC · ${PERSONAS[config.persona].name} · ${PERSONA_TRAIT[config.persona]}`)}
        </Text>
        {mc.status === 'ready' ? (
          <>
            <Text style={styles.line}>"{mc.note.line}"</Text>
            <Text style={styles.fix}>{mc.note.fix}</Text>
            <Text style={styles.src}>
              written by the MC ({appConfig.mcModelLabel}) from the measured set · an opinion
            </Text>
          </>
        ) : mc.status === 'writing' ? (
          <Text style={styles.writing}>writing from the measured set…</Text>
        ) : (
          <Text style={styles.silent}>{silentSentence(mc.reason)} The numbers on the left are the whole record.</Text>
        )}
      </View>

      <View style={styles.next}>
        <Text style={styles.nextLine}>
          {up('Press ')}
          <Text style={styles.nextKey}>OK</Text>
          {up(` to go again at the ${next.name}`)}
        </Text>
        <Text style={styles.nextSmall}>
          Back · green room · Up/Down · change venue
          {mc.status === 'ready'
            ? ` · the MC says ${nextWords(mc.note.next)}`
            : mc.status === 'unavailable'
              ? ` · measured: ${nextWords(measuredNext(record))}`
              : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.house },
  onStage: { backgroundColor: 'transparent' },
  darken: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.house, opacity: 0.74 },
  ledgerScrim: { position: 'absolute', left: 0, right: 0, top: sp(410), bottom: 0 },
  head: { position: 'absolute', left: edge.x, top: edge.top, right: edge.x },
  title: { ...dsp(72, display.extraBold, 0.05, colors.paper) },
  sub: { fontFamily: text.regular, fontSize: sp(26), color: colors.goldDim, marginTop: sp(10) },
  strip: { position: 'absolute', left: edge.x, right: edge.x, top: sp(220) },
  lab: { fontFamily: text.regular, fontSize: sp(24), color: colors.goldDim, marginBottom: sp(12) },
  frames: { flexDirection: 'row', height: sp(150) },
  frame: { overflow: 'hidden', backgroundColor: colors.frame, justifyContent: 'center', alignItems: 'center' },
  frameGap: { marginLeft: sp(6) },
  // Explicit width/height: on web a static asset otherwise keeps its own pixel size inside the frame (640×360 thumbs).
  frameImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  stripes: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.deadB,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stripeSquare: {
    flexDirection: 'row',
    width: sp(400),
    height: sp(400),
    flexShrink: 0,
    transform: [{ rotate: '45deg' }],
  },
  tag: {
    position: 'absolute',
    left: sp(10),
    bottom: sp(8),
    right: sp(6),
    ...dsp(24, display.medium, 0.06, colors.paper),
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: sp(1) },
    textShadowRadius: sp(8),
  },
  tagNarrow: { left: sp(6), right: sp(2), letterSpacing: sp(0.3) },
  tagGold: { color: colors.gold },
  tagDead: { color: colors.deadText },
  ticks: { height: sp(32), marginTop: sp(8) },
  tick: { position: 'absolute', top: 0, fontFamily: text.regular, fontSize: sp(24), color: colors.goldDim, ...tabular },
  tickEnd: { right: 0 },
  ledger: { position: 'absolute', left: edge.x, top: sp(452), width: sp(1000) },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: sp(6),
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  n: { width: sp(200), ...dsp(46, display.bold, 0.02, colors.paper, 1.15), ...tabular },
  nGood: { color: colors.gold },
  nNone: { fontFamily: text.regular, fontSize: sp(24), color: colors.goldDim, letterSpacing: 0 },
  k: { width: sp(330), fontFamily: text.regular, fontSize: sp(24), color: colors.paper },
  v: { flex: 1, fontFamily: text.regular, fontSize: sp(24), lineHeight: sp(24 * 1.3), color: colors.goldDim },
  mc: { position: 'absolute', left: sp(1180), right: edge.x, top: sp(452) },
  who: { ...dsp(28, display.semiBold, 0.14, colors.goldDim) },
  line: { fontFamily: text.medium, fontSize: sp(36), lineHeight: sp(36 * 1.3), color: colors.paper, marginTop: sp(14) },
  fix: { fontFamily: text.regular, fontSize: sp(26), lineHeight: sp(26 * 1.4), color: colors.gold, marginTop: sp(22) },
  src: {
    fontFamily: text.regular,
    fontSize: sp(24),
    lineHeight: sp(24 * 1.3),
    color: colors.goldDim,
    marginTop: sp(18),
  },
  writing: { fontFamily: text.regular, fontSize: sp(26), color: colors.goldDim, marginTop: sp(14) },
  silent: {
    fontFamily: text.regular,
    fontSize: sp(28),
    lineHeight: sp(28 * 1.4),
    color: colors.goldDim,
    marginTop: sp(14),
  },
  next: { position: 'absolute', left: edge.x, bottom: sp(44) },
  nextLine: { ...dsp(42, display.extraBold, 0.06, colors.paper) },
  nextKey: { color: colors.red },
  nextSmall: { fontFamily: text.regular, fontSize: sp(24), color: colors.goldDim, marginTop: sp(8) },
});
