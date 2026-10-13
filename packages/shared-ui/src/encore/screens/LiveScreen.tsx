import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { clockLabel, scorecard, type SetState } from '@strumble/crowd';
import { momentsOf } from '../moments';
import { Caption } from '../world/Caption';
import { clipCount, clipFor, type Clip, type ClipKind } from '../world/clips';
import { CrowdSound } from '../world/CrowdSound';
import { Cut } from '../world/Cut';
import { LightPulse } from '../world/LightPulse';
import { Hints } from '../world/Hints';
import { Live } from '../world/Live';
import { LowerThird } from '../world/LowerThird';
import { PitchTrace } from '../world/PitchTrace';
import { Plate } from '../world/Plate';
import { prefetchClips } from '../world/prefetch';
import { TitleCard } from '../world/TitleCard';
import { VideoPlate } from '../world/VideoPlate';
import { colors, display, dsp, edge, mmss, sp, text, textShadow, up } from '../world/theme';

/** The clock turns red inside the last half minute. */
const RED_CLOCK_SEC = 30;

/**
 * The set, live: the engine's current shot (a looping wide clip with the push-in, a reaction clip played once and held
 * on its last frame, a title card, the finale), the director's caption, the LIVE mark, the bit counter with the running
 * measured line, the lower-third, the hints, the light pulse on every cut and the crowd's sound.
 * One moving plate at a time: the shot's own; a wide clip restarts when the director returns to it. Each clip is looked up
 * by (venue, kind, angle) and falls back to the still plate the pack names.
 */
export function LiveScreen({
  state,
  replay = false,
  armedIntro = null,
  mcText = {},
  ducked = false,
  onCue,
  stage = false,
}: {
  state: SetState;
  replay?: boolean;
  /** The model's intro, asked for at arm time; without it the card carries the house and tier alone. */
  armedIntro?: string | null;
  /** The model's words per moment id (the finale caption is the `end` moment's). */
  mcText?: Record<number, string>;
  /** The MC is speaking: the room tone ducks. */
  ducked?: boolean;
  /** A crowd cue started (its length in seconds): the phone ignores its mic meanwhile. */
  onCue?: (sec: number) => void;
  /** The live 3D crowd is behind this screen (EncoreApp's stage): no plates, only title cards over it. */
  stage?: boolean;
}) {
  const { shot, venue, pack, config } = state;
  const lastWide = useRef<string>(venue.plates.wide[0] || '');
  if (shot.kind === 'wide' && shot.plate) lastWide.current = shot.plate;
  const now = state.now;
  const live = state.phase === 'live';
  const sc = scorecard(state);
  const singing = config.act === 'singing';
  const bit = state.bits.length ? state.bits[state.bits.length - 1] : undefined;
  const bitReactions = bit ? bit.reactions : 0;

  const measured: string[] = [];
  if (singing) {
    measured.push(`in tune ${sc.inTunePct === null ? 'not yet measured' : `${sc.inTunePct}%`}`);
    if (sc.longestHoldSec !== null && sc.longestHoldSec > 0)
      measured.push(`longest hold ${sc.longestHoldSec.toFixed(1)} s`);
    measured.push(`${sc.roomReactions} ${sc.roomReactions === 1 ? pack.reaction.noun : pack.reaction.plural}`);
  } else {
    measured.push(`${pack.reaction.plural} ${sc.roomReactions}`);
    measured.push(`longest dead air ${sc.longestDeadAirSec.toFixed(1)} s`);
    if (sc.wpm !== null) measured.push(`pace ${sc.wpm} wpm`);
  }

  // Singing uses its own clips for the angles it has (the rest fall back to the venue's: arena-wide-2, arena-finale-1);
  // poetry uses the venue's clips with poetry-reaction-1 as the open-mic reaction; a slot without a clip shows the still.
  const pick = (kind: ClipKind, n: number): Clip | undefined => {
    if (singing && n <= clipCount('singing', kind)) return clipFor('singing', kind, n);
    if (config.act === 'poetry' && config.venue === 'openmic' && kind === 'reaction' && n <= clipCount('poetry', kind))
      return clipFor('poetry', kind, n);
    return clipFor(config.venue, kind, n);
  };
  // Warm every clip this set can cut to as soon as the set starts (web only), so cuts land on moving footage.
  useEffect(() => {
    const wanted: (Clip | undefined)[] = [];
    for (const kind of ['wide', 'reaction', 'finale'] as ClipKind[]) {
      const n = Math.max(clipCount(config.venue, kind), singing ? clipCount('singing', kind) : 0, 1);
      for (let i = 1; i <= n; i++) wanted.push(pick(kind, i));
    }
    prefetchClips(wanted);
    // The venue and act fix the clip set; `pick` is derived from them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.venue, config.act]);
  // The open-mic clips are a neon room (pink/teal): the world's warm wash keeps them in the tungsten palette.
  const warm = config.venue === 'openmic' ? 0.12 : 0;
  const angle = (list: string[]) => Math.max(0, list.indexOf(shot.plate || '')) + 1;
  const positive = state.reactions.filter((r) => r.kind === pack.reaction.kind).length;
  const hints = useMemo<[string, string][]>(
    () => [
      ['OK', `end ${pack.unit}`],
      // Back drops the set and goes back to the bill (OK ends it and keeps it for the cut sheet).
      ['Back', `drop ${pack.unit}`],
    ],
    [pack.unit],
  );

  let base: React.ReactNode = null;
  let overlay: React.ReactNode = null;
  // Over the live 3D crowd (one continuous stage whose camera follows the engine's cuts) only title cards are laid.
  if (stage) {
    if (shot.kind === 'card') {
      overlay = shot.text ? (
        <TitleCard line={shot.text} who={`${venue.house} · ${venue.name}`} over={stage} />
      ) : (
        <TitleCard line={`${venue.house} · ${venue.name}`} over={stage} />
      );
    }
  } else if (shot.kind === 'wide') {
    base = (
      <VideoPlate
        key={`wide-${shot.from}`}
        clip={pick('wide', angle(venue.plates.wide))}
        fallback={shot.plate || lastWide.current}
        loop
        push={live}
        pushMs={Math.max(30000, state.endsAt * 1000)}
        grade={singing ? 'arena' : 'wide'}
        warm={warm}
      />
    );
  } else if (shot.kind === 'reaction' && shot.plate) {
    overlay = (
      <VideoPlate
        clip={pick('reaction', angle(venue.plates.reaction))}
        fallback={shot.plate}
        from={1.07}
        grade="reaction"
        warm={warm}
      />
    );
  } else if (shot.kind === 'card') {
    // Cards exist only with the model's words (the engine shows one on `mc-line`); never invent a line.
    overlay = shot.text ? (
      <TitleCard line={shot.text} who={`${venue.house} · ${venue.name}`} over={stage} />
    ) : (
      <TitleCard line={`${venue.house} · ${venue.name}`} over={stage} />
    );
  } else if (shot.kind === 'finale' && shot.plate) {
    overlay = <VideoPlate clip={pick('finale', 1)} fallback={shot.plate} from={1.04} warm={warm} />;
  }

  const dead = now - state.lastVoiceAt;
  let caption: React.ReactNode;
  if (shot.kind === 'reaction' && shot.caption) {
    const parts = shot.caption.split(' · ');
    caption = (
      <Caption what={parts[0]} why={parts[1] || ''} more={[...parts.slice(2), 'cut to the floor'].join(' · ')} />
    );
  } else if (shot.kind === 'wide' && shot.caption) {
    const parts = shot.caption.split(' · ');
    caption = <Caption what={parts[0]} why={parts.slice(1).join(' · ')} more="the wide holds" />;
  } else if (shot.kind === 'card' && shot.caption) {
    const parts = shot.caption.split(' · ');
    caption = <Caption small={parts[0]} emphasis={parts.slice(1).join(' · ')} />;
  } else if (shot.kind === 'finale') {
    const end = momentsOf(state).filter((m) => m.kind === 'end');
    const endText = end.length ? mcText[end[end.length - 1].id] : undefined;
    caption = endText ? (
      <Caption small="the end" emphasis={endText} />
    ) : (
      <Caption small={venue.house} emphasis={venue.name} />
    );
  } else if (shot.kind === 'wide') {
    const held = `wide · held ${Math.max(0, Math.floor(now - shot.from))} s`;
    const mood = state.speaking
      ? 'the room is listening'
      : dead >= 1.5
        ? `${dead.toFixed(1)} s of silence · patience ${venue.patienceSec.toFixed(1)} s`
        : singing
          ? 'the floor is with you'
          : 'the house is listening';
    caption = <Caption small={held} emphasis={mood} />;
  }

  return (
    <View style={[styles.root, stage && styles.onStage]}>
      {state.phase === 'armed' ? (
        <>
          {/* The intro card never blacks the picture out: over the room's plate while the 3D room isn't showing (crowd
              off, or the stage still building this room after a venue change: 4.5 s of black on the emulator when OK on
              the cut sheet started the next set one room up, black-screen hunt 2026-10-13), over the room itself
              otherwise. */}
          {stage ? null : <Plate id={lastWide.current} grade="wide" />}
          {armedIntro ? (
            <TitleCard line={armedIntro} who={`${venue.house} · ${venue.name}`} over />
          ) : (
            <TitleCard line={`${venue.house} · ${venue.name}`} over />
          )}
        </>
      ) : (
        <>
          {base}
          <Cut shotKey={`${shot.kind}:${shot.from}`} dip={!stage}>
            {overlay}
          </Cut>
          <LightPulse pulseKey={positive} />
          <CrowdSound state={state} duck={ducked} onCue={onCue} audible={!stage} />
          {caption}
          {singing && live ? <PitchTrace samples={state.pitch} now={now} measured={measured.join(' · ')} /> : null}
          {singing && live ? null : (
            <View style={styles.bits} pointerEvents="none">
              <Text style={styles.bitLine}>
                {up(singing ? 'phrase ' : 'bit ')}
                <Text style={styles.bitNumber}>{singing ? state.phrases.length : state.bits.length}</Text>
                {bit && !singing
                  ? up(` · ${bitReactions} ${bitReactions === 1 ? pack.reaction.noun : pack.reaction.plural}`)
                  : ''}
              </Text>
              <Text style={styles.measured}>{measured.join(' · ')}</Text>
            </View>
          )}
        </>
      )}
      <Live performer={config.performer} words={state.wordsMode} replay={replay} />
      <LowerThird
        house={venue.house}
        tier={venue.name}
        clock={clockLabel(state)}
        note={`of a ${mmss(config.durationSec)} ${pack.unit}`}
        red={live && state.endsAt - now <= RED_CLOCK_SEC}
      />
      <Hints items={hints} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.house },
  onStage: { backgroundColor: 'transparent' },
  bits: { position: 'absolute', right: edge.x, bottom: sp(150), alignItems: 'flex-end' },
  bitLine: { ...dsp(30, display.semiBold, 0.12, colors.paper, 1.1), ...textShadow, textAlign: 'right' },
  bitNumber: { color: colors.gold },
  measured: {
    fontFamily: text.regular,
    fontSize: sp(24),
    color: colors.goldDim,
    marginTop: sp(6),
    textAlign: 'right',
    ...textShadow,
  },
});
