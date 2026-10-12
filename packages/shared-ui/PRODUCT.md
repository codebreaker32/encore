# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

(Fire TV app: React Native for Vega OS on 2025–26 Fire TV Sticks, with a Fire OS/Android TV build for development on a Google TV. A 10-foot, remote-driven television interface, not a phone or desktop UI. Demo runs on the Vega Virtual Device.)

## Users

- **Solo performer practising at home:** an adult alone in the living room rehearsing stand-up, a song, a poem or a talk before a real event. Wants honest feedback and the feeling of a room.
- **Family and friends on a game night:** people taking turns performing for each other; the crowd is entertainment first, coaching second.
- Both audiences share the same crowd engine; the product serves them equally (confirmed 2026-10-10).

## Product Purpose

Encore (working title; final name undecided) turns the living-room TV into a live audience. The performer's phone, on the table, is the microphone and sensor. The TV shows a crowd that reacts in real time to measurable things in the performance (pauses, pace, fillers, punchline timing, pitch) and, when the performer switches words on, to what they say (counted patterns such as a callback, a rhyme or a list of three, plus one model estimate per line, shown as an estimate) and an MC character who introduces, heckles, debriefs and remembers. Success: the performer finishes a set knowing exactly which moment worked and which didn't, and wants to go again.

Built for the Build, Ship, Shape: Amazon Developer Hackathon (Fire TV track; AWS Builder and Open Source mini-challenges). Submission due 2026-10-23.

## Positioning

**A real audience, honestly scored.** The TV is a believable room that reacts live to measured signals, while a difficulty-independent scorecard reports only facts (laughs per minute, dead air, pace, filler rate, in-tune %). The crowd is theatre; the scorecard never lies. Karaoke apps score a song, speech coaches grade a transcript, party games entertain a group; none puts a reacting room on the wall with an honest ledger beside it.

## Operating Context

- Standing in a living room, facing the TV from 2–4 m, hands free, phone on a table or in a pocket; a remote nearby for OK/Back.
- Sets are short (an open-mic slot is 4–5 minutes). Vega closes apps after ~5 minutes without a remote press, so every set ends on an OK.
- Acts in v1 (confirmed): stand-up comedy, singing (scales and the performer's own material; no song catalogue), poetry/spoken word, speech/pitch/toast.
- Difficulty is expressed as venues: Open Mic → Comedy Club → Theatre → Arena (singing: Shower → Bar → Choir → Opera House). A harder venue is a tougher crowd and hecklers; the scorecard is unaffected.
- MC personalities the performer chooses: sarcastic, strict, warm, deadpan.

## Capabilities and Constraints

- Phone (browser) senses: microphone level and onsets, pitch (pitch-judge), words via the browser's speech recogniser. Audio never leaves the phone; words go to the AI host only with that stated on screen.
- TV renders: crowd, venue, MC, live set timeline, scorecard. No camera, no microphone, no speech-to-text, no WebGL/Three.js, no SVG on the simulator; 1 GB RAM, 32-bit CPU. Imagery must be photographic plates/sprites animated with transforms and crossfades; audio playback from the TV is possible but unreliable on the simulator (phone can play crowd sound as fallback).
- MC: Strands agent on Amazon Bedrock AgentCore with structured output and an honesty guard, running Qwen3 235B on Bedrock's OpenAI-compatible endpoint (Claude locked on the account, requests pending). Decided 2026-10-11: every MC word is written by the model; no template or rule-based lines. When the model can't answer, the MC is silent and the screen says why.
- Act packs are JSON files (measures, reaction palette, venue names, MC persona hints) served from S3; the pack format is the open-source contribution alongside couch-link.
- Phone ↔ TV over couch-link rooms (QR pairing, 4-letter codes, reconnect).
- Budget: $200 total on AWS; expected spend under $15.
- Decided 2026-10-10: product name **Encore**; crowd imagery is licensed photography (Unsplash, Pexels, CC BY) with licensed video clips (Pexels, Wikimedia Commons CC0/CC BY) as moving plates where playback works, stills as fallback; crowd sound from CC0 Freesound/Commons recordings (one CC BY).

## Brand Commitments

- The crowd and venues must **feel real**: photographic people and rooms, like a theatre audience laughing under stage light or a sea of raised hands in an arena (the team's binding reference images, 2026-10-10). Unique look per act and per venue level.
- Honesty rules carried from the previous concept: "unsure" is never counted against the performer; only measured things appear on the scorecard; nothing is claimed that isn't measured; AI opinions are labelled as opinions.

## Evidence on Hand

- Working stack in this repository: couch-link (phone-as-controller rooms), pitch-judge (pitch/onset analysis), practice rules (timed events, honest grading, loop logic), a coach agent service, a TV shell with pairing/lane/review screens (the previous Strumble guitar concept; its look is evidence only).
- TV mockups for the crowd concept and alternatives in `docs/mockups/` (`crowd.png`): concept comps, not approved design.
- No real performer footage yet; the developer will perform on camera for the demo. No testimonials, user numbers or partnerships exist and none may be invented.

## Product Principles

1. The room reacts to what was measured; the ledger reports what was measured. Theatre and truth stay separate on screen.
2. A tougher venue changes the crowd, never the score.
3. Hands free, eyes up: everything the performer needs is readable at 3 m while mid-performance; the phone is never looked at during a set.
4. The MC has a personality, not a chat box; it speaks in the show's own vocabulary and remembers past sets.
5. Nothing on screen is faked: real reactions to real signals, labelled estimates, no invented laughs for the demo.

## Accessibility & Inclusion

Readable at 10 feet (large type, high contrast against photographic backgrounds); every state reachable with OK/Back/Up/Down; crowd reactions never rely on audio alone (visual and audio both carry them); performers with accents are protected by the "unsure" rule.
