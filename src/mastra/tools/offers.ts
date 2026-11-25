import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { findCommune, findVehicle, loadCatalogue } from '../offers/catalogue';
import { normalize } from '../offers/guarantees';
import { searchOffers } from '../offers/search';
import {
  FIELD_RANGES,
  getProfile,
  missingFields,
  profileFieldsSchema,
  profileSummary,
  saveProfile,
  toSearchInput,
  type ProfileField,
  type UserProfile,
} from '../profile';

// --- Guard against invented numbers: the value must appear in what the user wrote ---

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, aucun: 0, aucune: 0, jamais: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8,
  neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30,
  quarante: 40, cinquante: 50, soixante: 60, cent: 100,
};
const CHECKED_NUMERIC: ProfileField[] = [
  'age', 'maxMonthlyBudget', 'licenseYears', 'bonusMalus', 'claimFreeYears', 'atFaultClaims',
  'vehicleYear', 'vehiclePower', 'vehicleNewPrice', 'annualKm',
];

function collectStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectStrings(x, out));
  return out;
}

export function numbersIn(text: string): number[] {
  // "15 000" / "15.000" -> "15000" (but keep "0.85")
  const t = normalize(text).replace(/(\d)[\s  .](?=\d{3}(\D|$))/g, '$1');
  const parse = (s: string) => parseFloat(s.replace(',', '.'));
  const nums: number[] = [];
  for (const m of t.matchAll(/\d+(?:[.,]\d+)?/g)) {
    nums.push(parse(m[0]));
    // "5.2017" in a numbered list is item 5 + year 2017, not 5.2017: keep the parts too.
    if (/[.,]/.test(m[0])) nums.push(...m[0].split(/[.,]/).map(Number));
  }
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(k|mille)\b/g)) nums.push(parse(m[1]) * 1000);
  // "bonus de 50 %" -> CRM 0.50 ; "malus 25 %" -> 1.25
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)) {
    const p = parse(m[1]) / 100;
    nums.push(p, +(1 - p).toFixed(4), +(1 + p).toFixed(4));
  }
  // "permis depuis 2015" -> 11 years
  const year = new Date().getFullYear();
  for (const n of [...nums]) if (Number.isInteger(n) && n >= 1950 && n <= year) nums.push(year - n);
  for (const w of t.split(/[^a-z]+/)) if (w in NUMBER_WORDS) nums.push(NUMBER_WORDS[w]);
  if (/\bpas (de|d')\s*(sinistre|accident)/.test(t)) nums.push(0);
  return nums;
}

function userNumbers(messages: readonly unknown[] | undefined): number[] | null {
  if (!messages) return null;
  const userText = messages
    .filter((m) => (m as { role?: string }).role === 'user')
    .flatMap((m) => collectStrings((m as { content?: unknown }).content))
    .join(' ');
  return numbersIn(userText);
}

// --- Catalogue enrichment: known vehicle -> power/energy/price ; known commune -> zone type ---

const VEHICLE_SPECS = ['vehiclePower', 'vehicleEnergy', 'vehicleNewPrice'] as const;

export async function enrichProfile(profile: UserProfile, prev: UserProfile, given: Partial<UserProfile>): Promise<string[]> {
  const notes: string[] = [];
  const p = profile as Record<string, unknown>;
  // A new vehicle / commune invalidates what was derived from the previous one.
  if (given.vehicle !== undefined && normalize(given.vehicle) !== normalize(prev.vehicle ?? ''))
    for (const k of VEHICLE_SPECS) if (given[k] === undefined) delete p[k];
  if (given.city !== undefined && normalize(given.city) !== normalize(prev.city ?? '') && given.zoneType === undefined) delete p.zoneType;

  const needVehicle = profile.vehicle !== undefined && VEHICLE_SPECS.some((k) => profile[k] === undefined);
  const needZone = profile.city !== undefined && profile.zoneType === undefined;
  if (!needVehicle && !needZone) return notes;

  try {
    const cat = await loadCatalogue();
    if (needVehicle) {
      const v = findVehicle(cat, profile.vehicle!);
      if (v) {
        profile.vehicle = v.model;
        profile.vehiclePower ??= v.power;
        profile.vehicleEnergy ??= v.energy;
        profile.vehicleNewPrice ??= v.newPrice;
        notes.push(`Véhicule reconnu dans la base : ${v.model} (${v.power} ch, ${v.energy}, ${v.newPrice.toLocaleString('fr-FR')} € neuf).`);
      } else notes.push(`« ${profile.vehicle} » n’est pas dans la base : demander la puissance (ch), l’énergie et le prix neuf.`);
    }
    if (needZone) {
      const c = findCommune(cat, profile.city!);
      if (c) {
        profile.city = c.name;
        profile.zoneType = c.zone;
        notes.push(`Commune reconnue : ${c.name} (zone ${c.zone.replace('_', ' ')}).`);
      } else notes.push(`Commune « ${profile.city} » inconnue de la base : demander le type de zone.`);
    }
  } catch (err) {
    notes.push(`Base de données indisponible (${(err as Error).message}).`);
  }
  return notes;
}

// --- Search for a complete profile (shared by the tool and the workflow) ---

export async function searchForProfile(profile: UserProfile) {
  const missing = missingFields(profile);
  const summary = profileSummary(profile);
  if (missing.length) {
    return {
      status: 'missing_info' as const,
      summary,
      missing,
      offers: [],
      ineligible: [],
      refusal: null,
      assumptions: [],
      unrecognizedPriorities: [],
      marketStats: [],
    };
  }
  const cat = await loadCatalogue();
  const { input, assumptions } = toSearchInput(profile);
  const res = searchOffers(cat, input);
  return {
    status: 'ok' as const,
    summary,
    missing,
    offers: res.offers,
    ineligible: res.ineligible,
    refusal: res.refusal,
    assumptions: [...assumptions, ...res.assumptions],
    unrecognizedPriorities: res.unrecognizedPriorities,
    marketStats: res.marketStats,
  };
}

// --- Tools ---

const summarySchema = z.array(z.object({ field: z.string(), label: z.string(), value: z.string().nullable() }));
const missingSchema = z.array(z.object({ field: z.string(), label: z.string(), question: z.string() }));

export const updateProfileTool = createTool({
  id: 'update-profile',
  description:
    "Enregistre dans le profil les informations que l'utilisateur vient de donner explicitement. " +
    'Ne renseigner QUE les champs que l’utilisateur a dits, jamais de supposition ni de valeur par défaut. ' +
    'Le véhicule et la commune sont complétés automatiquement depuis la base quand ils sont connus. ' +
    'Retourne le profil, les informations encore manquantes (avec la question à poser) et readyToSearch.',
  inputSchema: profileFieldsSchema,
  outputSchema: z.object({
    summary: summarySchema,
    rejected: z.array(z.object({ field: z.string(), reason: z.string() })),
    missing: missingSchema,
    notes: z.array(z.string()),
    readyToSearch: z.boolean(),
  }),
  execute: async (input, context) => {
    const threadId = context?.agent?.threadId ?? 'default';
    const said = userNumbers(context?.agent?.getMessages?.());
    const prev = getProfile(threadId);
    const profile: UserProfile = { ...prev };
    const given: Partial<UserProfile> = {};
    const rejected: { field: string; reason: string }[] = [];

    for (const [key, value] of Object.entries(input) as [ProfileField, unknown][]) {
      if (value === undefined || value === null) continue;
      if (said && CHECKED_NUMERIC.includes(key) && typeof value === 'number' && !said.some((n) => Math.abs(n - value) < 1e-6)) {
        rejected.push({ field: key, reason: `la valeur ${value} n'apparaît pas dans les messages de l'utilisateur : demande-la-lui` });
        continue;
      }
      const range = FIELD_RANGES[key];
      if (range && typeof value === 'number' && (value < range.min || value > range.max)) {
        rejected.push({
          field: key,
          reason: range.hint?.(value) ?? `${value} n'est pas plausible (attendu entre ${range.min} et ${range.max}) : vérifie avec l'utilisateur`,
        });
        continue;
      }
      (profile as Record<string, unknown>)[key] = value;
      (given as Record<string, unknown>)[key] = value;
    }

    const notes = await enrichProfile(profile, prev, given);
    saveProfile(threadId, profile);
    const missing = missingFields(profile);
    return { summary: profileSummary(profile), rejected, missing, notes, readyToSearch: missing.length === 0 };
  },
});

export const searchOffersTool = createTool({
  id: 'search-offers',
  description:
    "Recherche les offres d'assurance auto (France) adaptées au profil enregistré avec update-profile, avec un tarif estimé pour ce profil. " +
    "N'appeler que lorsque readyToSearch est vrai. Les critères viennent du profil enregistré, pas de paramètres.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    status: z.enum(['ok', 'missing_info']),
    summary: summarySchema,
    missing: missingSchema,
    offers: z.array(z.any()),
    ineligible: z.array(z.object({ id: z.string(), name: z.string(), reason: z.string() })),
    refusal: z.string().nullable(),
    assumptions: z.array(z.string()),
    unrecognizedPriorities: z.array(z.string()),
    marketStats: z.array(z.string()),
  }),
  execute: async (_input, context) => {
    const threadId = context?.agent?.threadId ?? 'default';
    return searchForProfile(getProfile(threadId));
  },
});
