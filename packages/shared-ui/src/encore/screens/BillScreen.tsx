import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { joinUrl, type Status } from 'couch-link';
import {
  ACT_IDS,
  PERSONAS,
  PERSONA_IDS,
  VENUE_IDS,
  getPack,
  getVenue,
  type ActId,
  type PersonaId,
  type VenueId,
} from '@strumble/crowd';
import { QrCode } from '../QrCode';
import type { Phone } from '../useSetSession';
import { Gradient } from '../world/Gradient';
import { Hints } from '../world/Hints';
import { LowerThird } from '../world/LowerThird';
import { Plate } from '../world/Plate';
import { colors, display, dsp, edge, mmss, sp, text, textShadow, up } from '../world/theme';

export interface Selection {
  act: ActId;
  venue: VenueId;
  persona: PersonaId;
}

/** The running order's rows: Act, Venue, MC. */
export type BillRow = 0 | 1 | 2;

export const PERSONA_TRAIT: Record<PersonaId, string> = {
  warm: 'Warm',
  sarcastic: 'Sarcastic',
  strict: 'Strict',
  deadpan: 'Deadpan',
};

const REACTS: Record<string, string> = { laugh: 'laughs', snap: 'snaps', applause: 'applauds', cheer: 'cheers' };

/** CC BY material carries its credit on the bill (plates/CREDITS.md, sounds/CREDITS.md); the rest is Unsplash / Pexels. */
const CREDITS =
  'Photos: S Pakhrin, Linda Marie, ACU Library (CC BY 2.0) · Crowd sounds, freesound.org: lonemonk, kevp888 (CC BY 4.0), Tomlija, alphahog (CC BY 3.0) · MC voice: Amazon Polly';

/**
 * Tonight's bill: the room you'll face is live on the left; the running order on the right; OK goes live.
 * Up/Down moves between rows, Left/Right changes the value.
 */
export function BillScreen({
  selection,
  focus,
  room,
  phone,
  phones,
  link,
  companionUrl,
  stage = false,
}: {
  selection: Selection;
  focus: BillRow;
  room?: string;
  /** The first phone with a live microphone. */
  phone?: Phone;
  phones: Phone[];
  link: Status;
  companionUrl: string;
  /** The live 3D room is behind this screen: the preview shows it instead of the photograph. */
  stage?: boolean;
}) {
  const pack = getPack(selection.act);
  const venue = getVenue(selection.act, selection.venue);
  const tough = venue.hecklesAfterDeadBits > 0;
  const url = room ? joinUrl(companionUrl, room) : undefined;
  const waiting = phones.find((p) => !p.micReady);

  const rows: { name: string; choices: { id: string; label: string; on: boolean }[]; why: string }[] = [
    {
      name: 'Act',
      choices: ACT_IDS.map((id) => ({ id, label: getPack(id).name, on: id === selection.act })),
      why: pack.listensFor,
    },
    {
      name: 'Venue',
      choices: VENUE_IDS.map((id) => ({ id, label: getVenue(selection.act, id).name, on: id === selection.venue })),
      why: venue.blurb,
    },
    {
      name: 'MC',
      choices: PERSONA_IDS.map((id) => ({ id, label: PERSONA_TRAIT[id], on: id === selection.persona })),
      why: `${PERSONAS[selection.persona].name} · ${PERSONAS[selection.persona].blurb}`,
    },
  ];

  return (
    <View style={[styles.root, stage && styles.onStage]}>
      {stage ? <View style={styles.house} /> : null}
      <View style={styles.preview}>
        {stage ? null : <Plate id={venue.plates.wide[0] || ''} push pushMs={90000} to={1.04} />}
        <Gradient
          horizontal
          style={styles.edge}
          stops={[
            { at: 0, alpha: 0 },
            { at: 1, alpha: 1 },
          ]}
        />
        <LowerThird
          house={venue.house}
          tier={venue.name}
          clock={mmss(pack.defaultDurationSec)}
          note={`${pack.unit} · ${tough ? 'a tough room, hecklers possible' : 'an easy room, nobody heckles'}`}
          bottom={sp(200)}
        />
        <Text style={styles.note}>
          This is the room you'll face. It {REACTS[pack.reaction.kind]} only when your timing earns it; the scorecard
          afterwards is the same at every venue.
        </Text>
      </View>
      <Text style={styles.brand}>{up('Encore')}</Text>

      <View style={styles.order}>
        {rows.map((row, i) => {
          const focused = focus === i;
          return (
            <View key={row.name} style={[styles.row, i > 0 && styles.rowGap]}>
              <Text style={styles.rowName}>{up(row.name)}</Text>
              <View style={styles.choices}>
                {row.choices.map((c, j) => (
                  <View key={c.id} style={[styles.choice, j > 0 && styles.choiceGap]}>
                    <Text
                      style={[styles.choiceText, c.on && (focused ? styles.choiceFocused : styles.choiceOn)]}
                      numberOfLines={1}
                    >
                      {up(c.label)}
                    </Text>
                    <View style={[styles.underline, c.on && focused && styles.underlineOn]} />
                  </View>
                ))}
              </View>
              {focused ? <Text style={styles.why}>{row.why}</Text> : null}
            </View>
          );
        })}

        <View style={styles.go}>
          {phone ? (
            <>
              <View style={styles.status}>
                <View style={styles.greenDot} />
                <Text style={styles.statusText}>{phone.name}'s phone is on the table and listening</Text>
              </View>
              <Text style={styles.cta}>
                {up('Press ')}
                <Text style={styles.ctaKey}>OK</Text>
                {up(' to go live')}
              </Text>
            </>
          ) : url && room ? (
            <View style={styles.pair}>
              <QrCode value={url} module={sp(6)} />
              <View style={styles.pairText}>
                <Text style={styles.roomLine}>
                  {up('Room ')}
                  <Text style={styles.roomCode}>{room}</Text>
                </Text>
                <Text style={styles.pairHint}>
                  scan with your phone, or open {url.replace(/^https?:\/\//, '').replace(/\/\?/, ' ?')}
                </Text>
                {waiting ? (
                  <Text style={styles.pairPhone}>
                    {waiting.name}'s phone is here · tap "Put it on the table" on the phone
                  </Text>
                ) : (
                  <Text style={styles.pairPhone}>the phone is the microphone; nothing it hears leaves it</Text>
                )}
              </View>
            </View>
          ) : (
            <Text style={styles.pairHint}>
              {link === 'ready'
                ? 'Opening a room…'
                : link === 'closed'
                  ? 'The relay is not reachable · check config.ts'
                  : 'Connecting to the relay…'}
            </Text>
          )}
        </View>
      </View>

      <Text style={styles.credits}>{CREDITS}</Text>
      <Hints
        items={[
          ['Up/Down', 'row'],
          ['Left/Right', 'change'],
          ['OK', 'go live'],
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.house },
  onStage: { backgroundColor: 'transparent' },
  /** Over the 3D room, the running order keeps its house-black column. */
  house: { position: 'absolute', left: sp(1180), right: 0, top: 0, bottom: 0, backgroundColor: colors.house },
  preview: { position: 'absolute', left: 0, top: 0, width: sp(1180), height: sp(1080), overflow: 'hidden' },
  edge: { position: 'absolute', left: sp(1180 - 320), right: 0, top: 0, bottom: 0 },
  note: {
    position: 'absolute',
    left: edge.x,
    bottom: sp(84),
    maxWidth: sp(820),
    fontFamily: text.regular,
    fontSize: sp(24),
    lineHeight: sp(24 * 1.4),
    color: colors.goldDim,
    ...textShadow,
  },
  brand: {
    position: 'absolute',
    left: edge.x,
    top: edge.top,
    ...dsp(40, display.extraBold, 0.12, colors.paper),
    ...textShadow,
  },
  order: {
    position: 'absolute',
    left: sp(1120),
    right: edge.x,
    top: edge.top,
    bottom: edge.bottom,
    justifyContent: 'center',
  },
  row: {},
  rowGap: { marginTop: sp(44) },
  rowName: { ...dsp(28, display.medium, 0.16, colors.goldDim) },
  choices: { flexDirection: 'row', flexWrap: 'nowrap', marginTop: sp(10) },
  choice: { alignItems: 'flex-start' },
  choiceGap: { marginLeft: sp(30) },
  choiceText: { ...dsp(44, display.semiBold, 0.03, colors.paperDim, 1.1) },
  choiceOn: { color: colors.paper },
  choiceFocused: { color: colors.gold },
  underline: { height: sp(5), alignSelf: 'stretch', marginTop: sp(4), backgroundColor: 'transparent' },
  underlineOn: { backgroundColor: colors.red },
  why: {
    fontFamily: text.regular,
    fontSize: sp(24),
    lineHeight: sp(24 * 1.4),
    color: colors.goldDim,
    marginTop: sp(10),
    maxWidth: sp(680),
  },
  go: { marginTop: sp(54) },
  status: { flexDirection: 'row', alignItems: 'center' },
  greenDot: { width: sp(14), height: sp(14), borderRadius: sp(7), backgroundColor: colors.green, marginRight: sp(10) },
  statusText: { fontFamily: text.regular, fontSize: sp(24), color: colors.paper },
  cta: { ...dsp(56, display.extraBold, 0.06, colors.paper), marginTop: sp(14) },
  ctaKey: { color: colors.red },
  pair: { flexDirection: 'row', alignItems: 'center' },
  pairText: { marginLeft: sp(28), flex: 1 },
  roomLine: { ...dsp(44, display.semiBold, 0.06, colors.paper) },
  roomCode: { color: colors.gold },
  pairHint: {
    fontFamily: text.regular,
    fontSize: sp(24),
    lineHeight: sp(24 * 1.4),
    color: colors.goldDim,
    marginTop: sp(8),
  },
  pairPhone: {
    fontFamily: text.regular,
    fontSize: sp(24),
    lineHeight: sp(24 * 1.4),
    color: colors.paper,
    marginTop: sp(10),
  },
  credits: {
    position: 'absolute',
    left: edge.x,
    bottom: sp(24),
    fontFamily: text.regular,
    fontSize: sp(24),
    color: colors.goldDim,
    opacity: 0.8,
    ...textShadow,
  },
});
