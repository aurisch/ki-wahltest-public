import type { PartyName } from './types';

export const parties: PartyName[] = [
  'CDU/CSU',
  'SPD',
  'Bündnis 90/Die Grünen',
  'AfD',
  'Die Linke',
  'FDP',
  'BSW',
  'Freie Wähler',
  'Volt',
  'ÖDP',
];

const slugs: Record<PartyName, string> = {
  'CDU/CSU': 'cdu-csu',
  SPD: 'spd',
  'Bündnis 90/Die Grünen': 'gruene',
  AfD: 'afd',
  'Die Linke': 'linke',
  FDP: 'fdp',
  BSW: 'bsw',
  'Freie Wähler': 'freie-waehler',
  Volt: 'volt',
  'ÖDP': 'oedp',
};

export function partySlug(party: PartyName): string {
  return slugs[party];
}

export function shortPartyName(party: PartyName): string {
  return party === 'Bündnis 90/Die Grünen' ? 'Grüne' : party;
}

export function pairSlug(first: PartyName, second: PartyName): string {
  return [partySlug(first), partySlug(second)].sort().join('-vs-');
}
