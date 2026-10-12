import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PERSONAS, getPack, getVenue, type ActId, type PersonaId, type SetRecord, type VenueId } from '@strumble/crowd';
import { Gradient } from '../world/Gradient';
import { Hints } from '../world/Hints';
import { Plate } from '../world/Plate';
import { colors, display, dsp, edge, mmss, sp, tabular, text, up } from '../world/theme';
import { PERSONA_TRAIT } from './BillScreen';

export interface Turn {
  who: 'MC' | 'You';
  text: string;
}

/** What the MC block shows. Only `speaking` carries MC words, and they are the model's. */
export type RoomMc =
  | { kind: 'speaking'; text: string }
  | { kind: 'writing' }
  | { kind: 'listening' }
  | { kind: 'waiting' }
  /** The screen's own sentence (the MC didn't answer, or the phone heard nothing); never in the MC's voice. */
  | { kind: 'notice'; text: string };

/** The performer's example questions (their words, not the MC's); the demo path asks the first. */
export const EXAMPLE_QUESTIONS = ['what killed bit three?', 'am I ready for the theatre?', 'be nicer tonight'];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One short measured line per past set, for the ledger. */
export function recordLine(r: SetRecord): string {
  const sc = r.scorecard;
  const parts: string[] = [];
  if (r.act === 'singing') {
    if (sc.inTunePct !== null) parts.push(`in tune ${sc.inTunePct}%`);
    if (sc.longestHoldSec !== null) parts.push(`hold ${sc.longestHoldSec.toFixed(1)} s`);
  } else {
    parts.push(`${sc.landed} of ${sc.candidates} landed`);
    if (sc.longestDeadAirSec >= 2) parts.push(`dead air ${sc.longestDeadAirSec.toFixed(1)} s`);
    if (sc.fillers && sc.fillers.count > 0) parts.push(`fillers ${sc.fillers.count}`);
    if (sc.wpm !== null && parts.length < 3) parts.push(`${sc.wpm} wpm`);
  }
  return parts.join(' · ');
}

/**
 * The green room: house lights up; the MC talks in the world's title-card voice; your sets at a glance.
 * OK makes the phone listen for one utterance and the model answers in character. When it can't, the MC is silent and
 * the screen says why. The earlier exchange shows only what actually happened this session.
 */
export function GreenRoomScreen({
  persona,
  earlier,
  mc,
  canAsk,
  records,
  nextAct,
  nextVenue,
  mcSays,
  stage = false,
}: {
  persona: PersonaId;
  earlier: Turn[];
  mc: RoomMc;
  /** A phone is on the table (or the web demo can type a question). */
  canAsk: boolean;
  records: SetRecord[];
  nextAct: ActId;
  nextVenue: VenueId;
  mcSays?: string;
  /** The live 3D room is behind this screen (emptying after the set): no photograph. */
  stage?: boolean;
}) {
  const pack = getPack(nextAct);
  const next = getVenue(nextAct, nextVenue);
  const best = records.reduce((m, r) => Math.max(m, r.scorecard.landedPerMin), 0);
  const listening = mc.kind === 'listening';
  const speaking = mc.kind === 'speaking';
  const who =
    mc.kind === 'speaking'
      ? 'MC · speaking'
      : mc.kind === 'writing'
        ? 'MC · writing'
        : mc.kind === 'listening'
          ? 'MC · listening'
          : mc.kind === 'waiting'
            ? 'MC · waiting for your question'
            : 'MC · silent';

  return (
    <View style={[styles.root, stage && styles.onStage]}>
      {stage ? null : <Plate id="theatre-red-seats-lit-faces-luhaers" from={1.03} grade="none" grainOpacity={0.1} />}
      <Gradient
        horizontal
        stops={[
          { at: 0, alpha: 0.93 },
          { at: 0.4, alpha: 0.84 },
          { at: 0.64, alpha: 0.5 },
          { at: 1, alpha: 0.42 },
        ]}
      />

      <View style={styles.head}>
        <Text style={styles.title}>{up('Green room')}</Text>
        <Text style={styles.sub}>
          Between sets with your MC · {PERSONAS[persona].name}, {PERSONA_TRAIT[persona].toLowerCase()} · remembers your
          last six sets
        </Text>
      </View>

      <View style={styles.earlier}>
        {earlier.slice(-2).map((t, i) => (
          <Text key={i} style={styles.turn} numberOfLines={2}>
            <Text style={styles.turnWho}>{up(t.who)} </Text>"{t.text}"
          </Text>
        ))}
      </View>

      <View style={styles.now}>
        <View style={styles.whoRow}>
          {speaking && <View style={styles.dotGlow} />}
          <View style={[styles.dot, !speaking && styles.dotIdle]} />
          <Text style={[styles.who, !speaking && styles.whoIdle]}>{up(who)}</Text>
        </View>
        {mc.kind === 'speaking' ? (
          <Text style={styles.line} numberOfLines={5}>
            "{up(mc.text)}"
          </Text>
        ) : mc.kind === 'notice' ? (
          <Text style={styles.notice}>{mc.text}</Text>
        ) : null}
      </View>

      <View style={styles.talk}>
        <Text style={styles.cta}>
          {listening ? (
            up('Listening · say it to the phone')
          ) : (
            <>
              {up('Press ')}
              <Text style={styles.ctaKey}>OK</Text>
              {up(' to talk')}
            </>
          )}
        </Text>
        {canAsk ? (
          <Text style={styles.ask}>
            Try <Text style={styles.askEm}>"{EXAMPLE_QUESTIONS[0]}"</Text>,{' '}
            <Text style={styles.askEm}>"{EXAMPLE_QUESTIONS[1]}"</Text> or{' '}
            <Text style={styles.askEm}>"{EXAMPLE_QUESTIONS[2]}"</Text>. Your words go to the MC; your audio never leaves
            the phone.
          </Text>
        ) : (
          <Text style={styles.ask}>
            No phone is on the table. Press Right for tonight's bill and scan the code, then come back.
          </Text>
        )}
      </View>

      <View style={styles.sets}>
        <Text style={styles.setsLab}>{up('Your sets · landed per minute')}</Text>
        {records.slice(-6).map((r) => {
          const d = new Date(r.endedAt);
          const day = isNaN(d.getTime()) ? '' : WEEKDAYS[d.getDay()];
          const v = getVenue(r.act, r.venue);
          return (
            <View key={r.setId} style={styles.setRow}>
              <Text style={[styles.setN, r.scorecard.landedPerMin === best && best > 0 && styles.setNGood]}>
                {r.scorecard.landedPerMin.toFixed(1)}
              </Text>
              <View style={styles.setD}>
                <Text style={styles.setTitle} numberOfLines={1}>
                  {v.name} · {getPack(r.act).name}
                  {day ? ` · ${day}` : ''}
                </Text>
                <Text style={styles.setSmall} numberOfLines={1}>
                  {recordLine(r)}
                </Text>
              </View>
            </View>
          );
        })}
        {records.length === 0 ? (
          <Text style={styles.setSmall}>No sets yet. The ledger starts with your first one.</Text>
        ) : null}
        <View style={styles.next}>
          <Text style={styles.nextV} numberOfLines={2}>
            {up('Next: ')}
            {up(next.house)} · <Text style={styles.nextEm}>{up(next.name)}</Text> · {mmss(pack.defaultDurationSec)}{' '}
            {up(pack.unit)}
          </Text>
          <Text style={styles.nextWhy} numberOfLines={3}>
            {next.blurb}
            {mcSays ? ` ${mcSays}` : ''}
          </Text>
        </View>
      </View>

      <Hints
        items={[
          ['OK', 'talk'],
          ['Right', "tonight's bill"],
          ['Back', 'cut sheet'],
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.house },
  onStage: { backgroundColor: 'transparent' },
  head: { position: 'absolute', left: edge.x, top: edge.top },
  title: { ...dsp(64, display.extraBold, 0.05, colors.paper) },
  sub: { fontFamily: text.regular, fontSize: sp(24), color: colors.goldDim, marginTop: sp(8) },
  earlier: { position: 'absolute', left: edge.x, top: sp(200), width: sp(980) },
  turn: {
    fontFamily: text.regular,
    fontSize: sp(24),
    lineHeight: sp(24 * 1.4),
    color: colors.paperSoft,
    marginBottom: sp(14),
  },
  turnWho: { ...dsp(24, display.semiBold, 0.1, colors.goldDim, 1.4) },
  now: { position: 'absolute', left: edge.x, top: sp(380), width: sp(1000) },
  whoRow: { flexDirection: 'row', alignItems: 'center' },
  dotGlow: {
    position: 'absolute',
    left: -sp(7),
    width: sp(28),
    height: sp(28),
    borderRadius: sp(14),
    backgroundColor: colors.red,
    opacity: 0.35,
  },
  dot: { width: sp(14), height: sp(14), borderRadius: sp(7), backgroundColor: colors.red, marginRight: sp(12) },
  dotIdle: { backgroundColor: colors.goldDim },
  who: { ...dsp(24, display.semiBold, 0.14, colors.gold) },
  whoIdle: { color: colors.goldDim },
  notice: {
    fontFamily: text.regular,
    fontSize: sp(30),
    lineHeight: sp(30 * 1.4),
    color: colors.goldDim,
    marginTop: sp(16),
    maxWidth: sp(980),
  },
  line: { ...dsp(60, display.bold, 0.02, colors.paper, 1.08), marginTop: sp(16) },
  talk: { position: 'absolute', left: edge.x, bottom: edge.bottom, width: sp(980) },
  cta: { ...dsp(46, display.extraBold, 0.06, colors.paper) },
  ctaKey: { color: colors.red },
  ask: {
    fontFamily: text.regular,
    fontSize: sp(24),
    lineHeight: sp(24 * 1.4),
    color: colors.goldDim,
    marginTop: sp(10),
  },
  askEm: { color: colors.paper },
  sets: { position: 'absolute', left: sp(1240), right: edge.x, top: sp(200) },
  setsLab: { ...dsp(24, display.semiBold, 0.14, colors.goldDim), marginBottom: sp(10) },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: sp(6),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,215,154,0.2)',
  },
  setN: { width: sp(110), ...dsp(44, display.bold, 0.02, colors.paper, 1.1), ...tabular },
  setNGood: { color: colors.gold },
  setD: { flex: 1, marginLeft: sp(18) },
  setTitle: { fontFamily: text.medium, fontSize: sp(24), color: colors.paper },
  setSmall: { fontFamily: text.regular, fontSize: sp(24), lineHeight: sp(24 * 1.25), color: colors.goldDim },
  next: { marginTop: sp(22) },
  nextV: { ...dsp(34, display.bold, 0.04, colors.paper, 1.1) },
  nextEm: { color: colors.gold },
  nextWhy: {
    fontFamily: text.regular,
    fontSize: sp(24),
    lineHeight: sp(24 * 1.3),
    color: colors.goldDim,
    marginTop: sp(6),
  },
});
