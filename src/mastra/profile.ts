import { z } from 'zod';
import { normalize } from './offers/guarantees';
import { crmFromHistory, type Level } from './offers/pricing';
import type { SearchInput } from './offers/search';

// What the offer advisor must know before searching French car-insurance offers.
// Questions follow objectif1.profils_dictionnaire, restricted to what the pricing uses.
// Every field is optional here: the profile is filled in turn by turn.

// The schema must never reject a whole update-profile call (Mastra then returns an error and every
// other field of the message is lost). So parsing is lenient — an unreadable value is dropped and the
// field stays missing — and value ranges are checked per field in the tool (FIELD_RANGES).

// Small models sometimes send numbers as strings ("21", "12ch", "17.000€") or null.
// (z.coerce would turn null into 0.)
export function parseNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\s  ]/g, '').replace(/^(\d{1,3})((?:\.\d{3})+)(?!\d)/, (_, a, b) => a + b.replace(/\./g, ''));
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}
const num = (inner: z.ZodNumber) => z.preprocess(parseNumber, inner.optional());

const bool = () =>
  z.preprocess((v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v !== 'string') return undefined;
    const t = normalize(v);
    return ['oui', 'true', 'yes', 'o'].includes(t) ? true : ['non', 'false', 'no', 'n'].includes(t) ? false : undefined;
  }, z.boolean().optional());

// Enum that also accepts the usual French wordings ("domicile-travail", "box", "gazole"...).
function choice<T extends string>(values: readonly [T, ...T[]], aliases: Record<string, T> = {}) {
  return z.preprocess((v) => {
    if (typeof v !== 'string' || v === '') return undefined;
    const t = normalize(v).replace(/[-\s]+/g, '_');
    if ((values as readonly string[]).includes(t)) return t;
    const hit = Object.entries(aliases).find(([k]) => t.includes(normalize(k).replace(/[-\s]+/g, '_')));
    return hit ? hit[1] : undefined;
  }, z.enum(values).optional());
}

const text = () =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined), z.string().optional());

// Plausible values, checked by update-profile field by field.
export const FIELD_RANGES: Partial<Record<string, { min: number; max: number; hint?: (v: number) => string | null }>> = {
  age: { min: 16, max: 99 },
  licenseYears: { min: 0, max: 80 },
  bonusMalus: { min: 0.5, max: 3.5, hint: () => 'le coefficient bonus-malus est compris entre 0,50 et 3,50' },
  claimFreeYears: { min: 0, max: 80 },
  atFaultClaims: { min: 0, max: 10 },
  vehicleYear: { min: 1950, max: new Date().getFullYear() + 1 },
  vehiclePower: {
    min: 30,
    max: 1000,
    hint: (v) =>
      v <= 20
        ? `${v} ressemble à une puissance fiscale (CV), pas à des chevaux : demander la puissance en ch (carte grise, case P.2 en kW × 1,36)`
        : null,
  },
  vehicleNewPrice: { min: 3000, max: 500000 },
  annualKm: { min: 0, max: 200000 },
  maxMonthlyBudget: { min: 1, max: 10000 },
};

export const profileFieldsSchema = z.object({
  age: num(z.number()).describe("Âge du conducteur principal"),
  licenseYears: num(z.number()).describe('Nombre d’années de permis B'),
  accompaniedDriving: bool().describe('A suivi la conduite accompagnée (AAC) ?'),
  licenceOrigin: choice(['france', 'ue', 'hors_ue'] as const, {
    hors: 'hors_ue', etranger: 'hors_ue', francais: 'france', europe: 'ue', union: 'ue',
  }).describe('Pays d’obtention du permis : france, ue (autre pays de l’UE) ou hors_ue'),
  bonusMalus: num(z.number()).describe('Coefficient bonus-malus (CRM), ex: 0.85 ; 0.50 = bonus maximal'),
  claimFreeYears: num(z.number()).describe('Années assuré sans sinistre responsable (si le CRM est inconnu)'),
  atFaultClaims: num(z.number()).describe('Nombre de sinistres responsables ces 3 dernières années'),
  vehicle: text().describe('Marque et modèle du véhicule, ex: "Renault Clio"'),
  vehicleYear: num(z.number()).describe('Année de mise en circulation'),
  vehiclePower: num(z.number()).describe('Puissance en chevaux (ch) — seulement si le véhicule est inconnu du catalogue'),
  vehicleEnergy: choice(['essence', 'diesel', 'hybride', 'electrique'] as const, {
    gazole: 'diesel', gasoil: 'diesel', elec: 'electrique', sp95: 'essence', sp98: 'essence',
  }).describe('Énergie — seulement si le véhicule est inconnu du catalogue'),
  vehicleNewPrice: num(z.number()).describe('Prix neuf du véhicule en € — seulement si le véhicule est inconnu du catalogue'),
  usage: choice(['prive', 'domicile_travail', 'professionnel'] as const, {
    travail: 'domicile_travail', trajet: 'domicile_travail', perso: 'prive', loisir: 'prive', vtc: 'professionnel', pro: 'professionnel',
  }).describe('Usage : prive, domicile_travail ou professionnel'),
  annualKm: num(z.number()).describe('Kilométrage annuel'),
  parking: choice(['garage', 'parking', 'rue'] as const, {
    box: 'garage', ferme: 'garage', prive: 'parking', residence: 'parking', voie: 'rue', exterieur: 'rue', dehors: 'rue',
  }).describe('Stationnement la nuit : garage (fermé), parking (privé) ou rue'),
  city: text().describe('Commune de résidence (ou code postal)'),
  zoneType: choice(['rural', 'periurbain', 'urbain', 'grande_ville', 'metropole'] as const, {
    campagne: 'rural', village: 'rural', banlieue: 'periurbain', peripherie: 'periurbain', ville_moyenne: 'urbain', grande: 'grande_ville',
  }).describe('Type de zone — seulement si la commune est inconnue du catalogue'),
  deductible: choice(['basse', 'standard', 'haute'] as const, { faible: 'basse', petite: 'basse', elevee: 'haute', grosse: 'haute', normale: 'standard' })
    .describe('Franchise souhaitée : basse, standard ou haute'),
  priorities: z
    .preprocess(
      (v) =>
        typeof v === 'string'
          ? v.split(/[,;]| et /).map((x) => x.trim()).filter(Boolean)
          : Array.isArray(v)
            ? v.filter((x) => typeof x === 'string')
            : undefined,
      z.array(z.string()).optional(),
    )
    .describe('Garanties prioritaires citées par l’utilisateur, ex: ["vol", "bris de glace"]. [] si aucune préférence.'),
  coverageLevel: choice(['tiers', 'intermediaire', 'tous_risques'] as const, {
    '+': 'intermediaire', plus: 'intermediaire', etendu: 'intermediaire', tiers_plus: 'intermediaire', vol_incendie: 'intermediaire', tous: 'tous_risques',
  }).describe('Formule souhaitée si l’utilisateur la cite : tiers, intermediaire (tiers+) ou tous_risques'),
  maxMonthlyBudget: num(z.number()).describe('Budget mensuel maximum en euros'),
});

export type UserProfile = z.infer<typeof profileFieldsSchema>;
export type ProfileField = keyof UserProfile;

export const FIELD_INFO: Record<ProfileField, { label: string; question: string }> = {
  age: { label: 'Âge', question: 'Quel âge avez-vous ?' },
  licenseYears: { label: 'Ancienneté du permis', question: 'Depuis combien d’années avez-vous votre permis B ?' },
  accompaniedDriving: { label: 'Conduite accompagnée', question: 'Avez-vous suivi la conduite accompagnée ?' },
  licenceOrigin: { label: 'Pays du permis', question: 'Avez-vous obtenu votre permis en France, dans un autre pays de l’UE, ou hors UE ?' },
  bonusMalus: {
    label: 'Bonus-malus',
    question: 'Quel est votre coefficient bonus-malus (CRM) ? Il figure sur votre relevé d’information (ex : 0,50 = bonus maximal).',
  },
  claimFreeYears: { label: 'Années sans sinistre', question: 'Depuis combien d’années êtes-vous assuré sans sinistre responsable ?' },
  atFaultClaims: { label: 'Sinistres responsables (3 ans)', question: 'Combien de sinistres responsables avez-vous eus ces 3 dernières années ?' },
  vehicle: { label: 'Véhicule', question: 'Quel véhicule souhaitez-vous assurer (marque et modèle) ?' },
  vehicleYear: { label: 'Année du véhicule', question: 'De quelle année date le véhicule (mise en circulation) ?' },
  vehiclePower: { label: 'Puissance', question: 'Quelle est la puissance du véhicule en chevaux (ch) ?' },
  vehicleEnergy: { label: 'Énergie', question: 'Est-il essence, diesel, hybride ou électrique ?' },
  vehicleNewPrice: { label: 'Prix neuf', question: 'Quel était son prix neuf, environ ?' },
  usage: { label: 'Usage', question: 'Quel usage en faites-vous : privé, trajets domicile-travail ou professionnel ?' },
  annualKm: { label: 'Kilométrage annuel', question: 'Combien de kilomètres parcourez-vous par an, environ ?' },
  parking: { label: 'Stationnement', question: 'Où stationne-t-il la nuit : garage fermé, parking privé ou dans la rue ?' },
  city: { label: 'Commune', question: 'Dans quelle commune habitez-vous ?' },
  zoneType: {
    label: 'Type de zone',
    question: 'Votre commune est-elle rurale, périurbaine, une ville moyenne, une grande ville ou une métropole (Paris, Lyon, Marseille) ?',
  },
  deductible: { label: 'Franchise', question: 'Préférez-vous une franchise basse, standard ou haute ?' },
  priorities: { label: 'Garanties prioritaires', question: 'Quelles garanties sont les plus importantes pour vous (vol, bris de glace, tous risques…) ?' },
  coverageLevel: { label: 'Formule', question: 'Quelle formule visez-vous : tiers, tiers+ ou tous risques ?' },
  maxMonthlyBudget: { label: 'Budget max', question: 'Quel budget mensuel maximum souhaitez-vous y consacrer ?' },
};

// Required fields. Some depend on earlier answers.
export function requiredFields(p: UserProfile): ProfileField[] {
  const novice = p.licenseYears !== undefined && p.licenseYears < 3;
  const experienced = p.licenseYears !== undefined && p.licenseYears >= 3;
  return [
    'age',
    'licenseYears',
    ...(novice ? (['accompaniedDriving'] as const) : []),
    'licenceOrigin',
    'atFaultClaims',
    // Novices get the regulatory CRM (1.00 then −5 %/year); others must give it, or their claim-free years.
    ...(experienced ? ([p.claimFreeYears !== undefined && p.bonusMalus === undefined ? 'claimFreeYears' : 'bonusMalus'] as const) : []),
    'vehicle',
    // Filled from the catalogue when the model is known; asked otherwise.
    ...(p.vehicle !== undefined ? (['vehiclePower', 'vehicleEnergy', 'vehicleNewPrice'] as const) : []),
    'vehicleYear',
    'usage',
    'annualKm',
    'parking',
    'city',
    ...(p.city !== undefined ? (['zoneType'] as const) : []),
    'priorities',
    'maxMonthlyBudget',
  ];
}

export function missingFields(p: UserProfile) {
  return requiredFields(p)
    .filter((f) => p[f] === undefined)
    .map((field) => ({ field, ...FIELD_INFO[field] }));
}

export function profileSummary(p: UserProfile) {
  const fields = [...requiredFields(p), 'deductible', ...(p.coverageLevel ? ['coverageLevel'] : [])] as ProfileField[];
  return fields.map((field) => ({
    field,
    label: FIELD_INFO[field].label,
    value: field === 'deductible' && p.deductible === undefined ? 'standard (par défaut)' : formatValue(field, p[field]),
  }));
}

const LEVEL_NAMES: Record<Level, string> = { tiers: 'tiers', intermediaire: 'tiers+', tous_risques: 'tous risques' };

function formatValue(field: ProfileField, v: unknown): string | null {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'aucune préférence';
  const n = typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v);
  switch (field) {
    case 'maxMonthlyBudget': return `${n} €/mois`;
    case 'age': return `${n} ans`;
    case 'licenseYears': case 'claimFreeYears': return `${n} an(s)`;
    case 'bonusMalus': return (v as number).toFixed(2);
    case 'vehiclePower': return `${n} ch`;
    case 'vehicleNewPrice': return `${n} €`;
    case 'annualKm': return `${n} km/an`;
    case 'coverageLevel': return LEVEL_NAMES[v as Level];
    case 'licenceOrigin': return v === 'hors_ue' ? 'hors UE' : v === 'ue' ? 'UE' : 'France';
    default: return n.replace(/_/g, ' ');
  }
}

// Complete profile -> pricing/search input. Returns the assumptions made along the way.
export function toSearchInput(p: UserProfile): { input: SearchInput; assumptions: string[] } {
  const assumptions: string[] = [];
  const licenseYears = p.licenseYears!;
  let crm = p.bonusMalus;
  if (crm === undefined) {
    const years = licenseYears < 3 ? Math.floor(licenseYears) : p.claimFreeYears ?? 0;
    crm = crmFromHistory(years, p.atFaultClaims ?? 0);
    assumptions.push(`Bonus-malus estimé à ${crm.toFixed(2)} d’après la règle française (−5 %/an sans sinistre, +25 % par sinistre responsable).`);
  }
  if (p.deductible === undefined) assumptions.push('Franchise standard retenue (non précisée).');
  return {
    assumptions,
    input: {
      age: p.age!,
      licenseYears,
      accompaniedDriving: licenseYears < 3 ? p.accompaniedDriving ?? false : false,
      licenceOrigin: p.licenceOrigin!,
      crm,
      power: p.vehiclePower!,
      energy: p.vehicleEnergy!,
      newPrice: p.vehicleNewPrice!,
      vehicleAge: Math.max(0, new Date().getFullYear() - p.vehicleYear!),
      zone: p.zoneType!,
      usage: p.usage!,
      annualKm: p.annualKm!,
      parking: p.parking!,
      deductible: p.deductible ?? 'standard',
      atFaultClaims: p.atFaultClaims!,
      priorities: p.priorities ?? [],
      coverageLevel: p.coverageLevel,
      maxMonthlyBudget: p.maxMonthlyBudget!,
    },
  };
}

// --- Per-conversation store (in-process; resets when the Mastra server restarts) ---

const profiles = new Map<string, UserProfile>();

export const getProfile = (threadId: string): UserProfile => profiles.get(threadId) ?? {};
export const saveProfile = (threadId: string, p: UserProfile) => profiles.set(threadId, p);
