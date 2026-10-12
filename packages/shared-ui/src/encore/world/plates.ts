// Generated from src/assets/plates/*.jpg: plate id (file name without extension) → image. Regenerate when the folder changes.
// Metro needs literal require() calls, so this list is explicit.
import type { ImageSourcePropType } from 'react-native';

export const plateImages: Record<string, ImageSourcePropType> = {
  'arena-cheering-faces-green': require('../../assets/plates/arena-cheering-faces-green.jpg'),
  'arena-crowd-faces-from-stage-whitehead': require('../../assets/plates/arena-crowd-faces-from-stage-whitehead.jpg'),
  'arena-festival-hands-up-lakatos': require('../../assets/plates/arena-festival-hands-up-lakatos.jpg'),
  'arena-hands-raised-orange-vanleur': require('../../assets/plates/arena-hands-raised-orange-vanleur.jpg'),
  'arena-packed-blue-crowd-quintero': require('../../assets/plates/arena-packed-blue-crowd-quintero.jpg'),
  'comedy-club-brick-overhead-smersh': require('../../assets/plates/comedy-club-brick-overhead-smersh.jpg'),
  'comedy-club-crowd-hands-quintero': require('../../assets/plates/comedy-club-crowd-hands-quintero.jpg'),
  'comedy-club-dark-red-quintero': require('../../assets/plates/comedy-club-dark-red-quintero.jpg'),
  'comedy-club-neon-crowd-regan-asante': require('../../assets/plates/comedy-club-neon-crowd-regan-asante.jpg'),
  'comedy-improv-bar-audience-lindamarie': require('../../assets/plates/comedy-improv-bar-audience-lindamarie.jpg'),
  'comedy-laughing-crowd-jimenez': require('../../assets/plates/comedy-laughing-crowd-jimenez.jpg'),
  'comedy-laughing-faces-bucks': require('../../assets/plates/comedy-laughing-faces-bucks.jpg'),
  'comedy-laughing-seated-group-lewis': require('../../assets/plates/comedy-laughing-seated-group-lewis.jpg'),
  'openmic-cafe-open-mic-pakhrin': require('../../assets/plates/openmic-cafe-open-mic-pakhrin.jpg'),
  'openmic-pub-guitar-from-stage-bertelli': require('../../assets/plates/openmic-pub-guitar-from-stage-bertelli.jpg'),
  'openmic-pub-tables-from-stage-bertelli': require('../../assets/plates/openmic-pub-tables-from-stage-bertelli.jpg'),
  'openmic-singer-facing-tables-winminaung': require('../../assets/plates/openmic-singer-facing-tables-winminaung.jpg'),
  'openmic-small-club-crowd-attias': require('../../assets/plates/openmic-small-club-crowd-attias.jpg'),
  'poetry-slam-open-mic-audience-aculibrary': require('../../assets/plates/poetry-slam-open-mic-audience-aculibrary.jpg'),
  'singing-phone-lights-crowd-blue-quintero': require('../../assets/plates/singing-phone-lights-crowd-blue-quintero.jpg'),
  'singing-phone-lights-dark-osezua': require('../../assets/plates/singing-phone-lights-dark-osezua.jpg'),
  'singing-phones-faces-warm-quintero': require('../../assets/plates/singing-phones-faces-warm-quintero.jpg'),
  'singing-phones-up-blue-qudratovna': require('../../assets/plates/singing-phones-up-blue-qudratovna.jpg'),
  'theatre-applause-red-seats-vietfotos': require('../../assets/plates/theatre-applause-red-seats-vietfotos.jpg'),
  'theatre-attentive-audience-antenna': require('../../assets/plates/theatre-attentive-audience-antenna.jpg'),
  'theatre-auditorium-seated-productschool': require('../../assets/plates/theatre-auditorium-seated-productschool.jpg'),
  'theatre-balconies-santa-isabel-ribeiro': require('../../assets/plates/theatre-balconies-santa-isabel-ribeiro.jpg'),
  'theatre-opera-house-balconies-dumitru': require('../../assets/plates/theatre-opera-house-balconies-dumitru.jpg'),
  'theatre-red-seats-lit-faces-luhaers': require('../../assets/plates/theatre-red-seats-lit-faces-luhaers.jpg'),
  'theatre-rows-warm-faces-oquendo': require('../../assets/plates/theatre-rows-warm-faces-oquendo.jpg'),
};

export const PLATE_IDS = Object.keys(plateImages);

/** Falls back to the first plate so a bad id never leaves the room black. */
export function plateSource(id: string): ImageSourcePropType {
  return plateImages[id] || plateImages[PLATE_IDS[0]];
}
