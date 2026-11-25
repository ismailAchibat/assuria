// Pricing model behind objectif1.offres_prix_profils, rebuilt so that any user can be priced
// (the table only holds ~180 sample French drivers).
//
//   annual(level) = coefProfil × (base_tiers + (base_level − base_tiers) × coefDommages)
//   coefProfil    = product of the 11 profile coefficients below (exact on every row of the table)
//   coefDommages  = sqrt(valeur actuelle / 12 000) × franchise, valeur actuelle = prix neuf × 0.85^âge
//
// Coefficient bands were read from the table (France, auto). `npm run validate:pricing`
// recomputes every France row from its profile and reports the error.

export type Level = 'tiers' | 'intermediaire' | 'tous_risques';
export type Zone = 'rural' | 'periurbain' | 'urbain' | 'grande_ville' | 'metropole';
export type Energy = 'essence' | 'diesel' | 'hybride' | 'electrique';
export type Usage = 'prive' | 'domicile_travail' | 'professionnel';
export type Parking = 'garage' | 'parking' | 'rue';
export type Deductible = 'basse' | 'standard' | 'haute';
export type LicenceOrigin = 'france' | 'ue' | 'hors_ue';

export interface PricingInput {
  age: number;
  licenseYears: number;
  accompaniedDriving: boolean;
  licenceOrigin: LicenceOrigin;
  crm: number; // coefficient bonus-malus (0.50 .. 3.50)
  power: number; // ch
  energy: Energy;
  newPrice: number; // €
  vehicleAge: number; // years
  zone: Zone;
  usage: Usage;
  annualKm: number;
  parking: Parking;
  deductible: Deductible;
}

export interface PriceFactor {
  key: string;
  label: string;
  coef: number;
}

// [upper bound (inclusive), coefficient]
type Bands = [number, number][];
const band = (x: number, bands: Bands) => (bands.find(([max]) => x <= max) ?? bands[bands.length - 1])[1];

const AGE: Bands = [[30, 1.2076], [40, 1.0044], [50, 1.0845], [60, 1], [70, 0.8865], [Infinity, 1.0898]];
const POWER: Bands = [[80, 0.9288], [95, 1], [122, 1.0852], [167, 1.0602], [194, 1.0268], [264, 1.2223], [Infinity, 1.313]];
const VEHICLE_AGE: Bands = [[0, 0.9927], [2, 0.9749], [6, 1], [10, 1.0391], [14, 0.9094], [Infinity, 0.7228]];
const KM: Bands = [[4999, 0.85], [11999, 0.93], [19999, 1], [29999, 1.07], [39999, 1.15], [Infinity, 1.25]];
const ZONE: Record<Zone, number> = { rural: 0.8225, periurbain: 0.9294, urbain: 1, grande_ville: 1.3, metropole: 1.5434 };
const ENERGY: Record<Energy, number> = { essence: 1, hybride: 1, electrique: 1.05, diesel: 1.1932 };
const USAGE: Record<Usage, number> = { prive: 1, domicile_travail: 1.05, professionnel: 1.2 };
const PARKING: Record<Parking, number> = { garage: 0.93, parking: 1, rue: 1.08 };
const DEDUCTIBLE: Record<Deductible, number> = { basse: 1.1, standard: 1, haute: 0.88 };
// Surcharge by licence years 0, 1, 2, 3+; accompanied driving (conduite accompagnée) moves one step down.
const YOUNG = [2, 1.5, 1.25, 1, 1];

// French bonus-malus rule: −5 % per claim-free year (floor 0.50), +25 % per at-fault claim (cap 3.50).
export function crmFromHistory(claimFreeYears: number, atFaultClaims: number): number {
  const crm = Math.max(0.5, 0.95 ** Math.max(0, claimFreeYears)) * 1.25 ** Math.max(0, atFaultClaims);
  return Math.min(3.5, Math.round(crm * 100) / 100);
}

export const vehicleValue = (newPrice: number, vehicleAge: number) => newPrice * 0.85 ** Math.max(0, vehicleAge);

export function profileFactors(p: PricingInput): PriceFactor[] {
  const years = Math.max(0, Math.floor(p.licenseYears));
  const young = YOUNG[Math.min(years, 3) + (p.accompaniedDriving && years < 3 ? 1 : 0)];
  return [
    { key: 'age', label: `Âge (${p.age} ans)`, coef: band(p.age, AGE) },
    { key: 'puissance', label: `Puissance (${p.power} ch)`, coef: band(p.power, POWER) },
    { key: 'age_vehicule', label: `Âge du véhicule (${p.vehicleAge} an(s))`, coef: band(p.vehicleAge, VEHICLE_AGE) },
    { key: 'zone', label: `Zone (${p.zone.replace('_', ' ')})`, coef: ZONE[p.zone] },
    { key: 'energie', label: `Énergie (${p.energy})`, coef: ENERGY[p.energy] },
    { key: 'bonus_malus', label: `Bonus-malus (CRM ${p.crm.toFixed(2)})`, coef: p.crm / 0.5 },
    { key: 'jeune_conducteur', label: `Jeune conducteur (permis ${years} an(s)${p.accompaniedDriving ? ', conduite accompagnée' : ''})`, coef: young },
    { key: 'permis_etranger', label: 'Permis obtenu hors UE', coef: p.licenceOrigin === 'hors_ue' ? 1.1 : 1 },
    { key: 'usage', label: `Usage (${p.usage.replace('_', '-')})`, coef: USAGE[p.usage] },
    { key: 'kilometrage', label: `Kilométrage (${p.annualKm.toLocaleString('fr-FR')} km/an)`, coef: band(p.annualKm, KM) },
    { key: 'stationnement', label: `Stationnement (${p.parking})`, coef: PARKING[p.parking] },
  ];
}

export function damageCoef(p: Pick<PricingInput, 'newPrice' | 'vehicleAge' | 'deductible'>): number {
  return Math.sqrt(vehicleValue(p.newPrice, p.vehicleAge) / 12000) * DEDUCTIBLE[p.deductible];
}

export interface ProfilePricing {
  coefProfil: number;
  coefDommages: number;
  factors: PriceFactor[];
}

export function priceProfile(p: PricingInput): ProfilePricing {
  const factors = profileFactors(p);
  return {
    coefProfil: factors.reduce((acc, f) => acc * f.coef, 1),
    coefDommages: damageCoef(p),
    factors,
  };
}

// Annual premium of one offer at one level, from its base prices (objectif1.prix_base).
export function annualPremium(pricing: ProfilePricing, baseTiers: number, baseLevel: number): number {
  return pricing.coefProfil * (baseTiers + (baseLevel - baseTiers) * pricing.coefDommages);
}
