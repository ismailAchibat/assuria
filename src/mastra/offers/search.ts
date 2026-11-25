import type { Catalogue, CatalogueOffer, FrProduct } from './catalogue';
import {
  FR_LEVEL,
  GUARANTEES,
  LEVEL_CODES,
  LEVEL_LABEL,
  LEVELS,
  STATS_KEY,
  guaranteeCode,
  levelRank,
  minLevelFor,
} from './guarantees';
import { annualPremium, priceProfile, type Level, type PricingInput, type ProfilePricing } from './pricing';

// Deterministic, explainable offer search — kept outside the LLM on purpose.

export interface SearchInput extends PricingInput {
  atFaultClaims: number;
  priorities: string[]; // free text, mapped to guarantee codes
  coverageLevel?: Level;
  maxMonthlyBudget: number;
}

export interface PricedOffer {
  id: string;
  insurer: string;
  name: string;
  level: Level;
  coverageLevel: string; // label of the formula
  monthlyPremium: number;
  annualPremium: number;
  withinBudget: boolean;
  score: number;
  deductible: string;
  guarantees: string[]; // included at this formula
  options: string[]; // available on top (included or optional depending on the contract)
  matchedGuarantees: string[];
  missingGuarantees: string[];
  priceFactors: { label: string; coef: number }[];
  priceSource: string;
  advertisedFrom: { monthly: number; formula: string; profile: string } | null;
  exclusions: string[];
  restrictions: string[];
  sourceUrl: string | null;
  notes: string;
}

export interface SearchResult {
  offers: PricedOffer[];
  ineligible: { id: string; name: string; reason: string }[];
  refusal: string | null; // the profile is refused by every offer of the catalogue
  assumptions: string[];
  unrecognizedPriorities: string[];
  marketStats: string[];
  catalogueSize: number;
}

// Refusal rules found in offres_prix_profils.statut (identical for every French offer).
function profileRefusal(p: SearchInput): string | null {
  if (p.atFaultClaims >= 3)
    return '3 sinistres responsables ou plus en 3 ans : refusé par tous les assureurs du catalogue (s’orienter vers un assureur spécialisé risques aggravés)';
  if (p.power > 250 && p.licenseYears < 3 && p.age <= 22)
    return 'véhicule de plus de 250 ch pour un jeune conducteur : refusé par tous les assureurs du catalogue';
  return null;
}

// Products made for another situation (from their names in offres_europe). They are left out
// silently: listing them made the small LLM confuse e.g. "Allianz Auto malussé" with Allianz's main offer.
const SCOPE_RULES: Record<string, (p: SearchInput) => string | null> = {
  fr_adep_auto: () => 'réservée aux résidents d’Outre-mer (assureur AMOM)',
  fr_wakam_auto_920173: () => 'réservée aux résidents d’Outre-mer (Auto DOM)',
  fr_allianz_france_auto_2178b3: (p) => (p.crm > 1 ? null : 'réservée aux conducteurs malussés (CRM > 1)'),
};

type Coverage = 'inclus' | 'en option' | 'selon contrat' | null;

interface LevelView {
  included: Set<string>;
  options: Set<string>;
  frProduct?: FrProduct;
}

function levelAvailable(o: CatalogueOffer, level: Level): boolean {
  if (!o.bases[level] || !o.bases.tiers) return false;
  const fr = o.fr[level]?.levels[FR_LEVEL[level]];
  return fr ? fr.available : true;
}

function levelView(o: CatalogueOffer, level: Level): LevelView {
  const product = o.fr[level];
  // Generic view from the offres_europe flags.
  const flagged = (code: string) => {
    const f = GUARANTEES[code]?.flag;
    return f ? o.flags[f] : false;
  };
  const included = new Set(LEVEL_CODES[level].filter((c) => c === 'rc' || c === 'defense_recours' || flagged(c)));
  const options = new Set(Object.keys(GUARANTEES).filter((c) => !GUARANTEES[c].level && flagged(c)));
  if (!product) return { included, options };

  // Detailed view from fr_garanties_produits + fr_niveaux_offres.
  const fl = product.levels[FR_LEVEL[level]];
  const notOffered = new Set(fl?.notOffered ?? []);
  const productCodes = new Set(product.guarantees.map((g) => g.code));
  const frIncluded = new Set<string>([
    ...product.guarantees.filter((g) => g.status === 'included').map((g) => g.code),
    ...(fl?.add ?? []),
    ...LEVEL_CODES[level].filter((c) => productCodes.has(c)),
  ]);
  const frOptions = new Set(
    product.guarantees
      .filter((g) => g.status !== 'included' && !frIncluded.has(g.code))
      .map((g) => g.code)
      .filter((c) => {
        const l = GUARANTEES[c]?.level;
        return !l || levelRank(l) <= levelRank(level);
      }),
  );
  // Codes the product sheet does not mention keep the generic answer.
  for (const c of included) if (!productCodes.has(c)) frIncluded.add(c);
  for (const c of options) if (!productCodes.has(c)) frOptions.add(c);
  for (const c of notOffered) {
    frIncluded.delete(c);
    frOptions.delete(c);
  }
  frIncluded.delete('autre');
  frOptions.delete('autre');
  return { included: frIncluded, options: frOptions, frProduct: product };
}

function coverage(view: LevelView, code: string): Coverage {
  if (view.included.has(code)) return 'inclus';
  if (view.options.has(code)) return view.frProduct && view.frProduct.guarantees.some((g) => g.code === code) ? 'en option' : 'selon contrat';
  return null;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function describeStats(cat: Catalogue, codes: string[]): string[] {
  const keys = [...new Set(codes.map((c) => STATS_KEY[c]).filter(Boolean))];
  return keys.slice(0, 3).flatMap((key) => {
    const freq = cat.marketStats.find((s) => s.guarantee === key && s.metric === 'claim_frequency');
    const cost = cat.marketStats.find((s) => s.guarantee === key && s.metric === 'avg_claim_cost');
    if (!freq && !cost) return [];
    const label = key === 'dommages' ? 'Dommages au véhicule' : key === 'rc_materiels' ? 'Responsabilité civile (matériel)' : cat.guaranteeLabels.get(key) ?? key;
    const parts = [
      freq && `${freq.value.toLocaleString('fr-FR')} sinistres pour 1 000 voitures par an`,
      cost && `coût moyen ${cost.value.toLocaleString('fr-FR')} €`,
    ].filter(Boolean);
    return [`${label} : ${parts.join(', ')} (${(freq ?? cost)!.source}, ${(freq ?? cost)!.year})`];
  });
}

export function searchOffers(cat: Catalogue, input: SearchInput, topK = 3): SearchResult {
  const label = (code: string) => cat.guaranteeLabels.get(code) ?? code;
  const wanted: string[] = [];
  const unrecognizedPriorities: string[] = [];
  for (const p of input.priorities) {
    const code = guaranteeCode(p);
    if (code) {
      if (!wanted.includes(code)) wanted.push(code);
    } else unrecognizedPriorities.push(p);
  }
  const marketStats = describeStats(cat, wanted.length ? wanted : ['bris_de_glace', 'vol', 'dommages_tous_accidents']);
  const base = { assumptions: [] as string[], unrecognizedPriorities, marketStats, catalogueSize: cat.offers.length };

  const refusal = profileRefusal(input);
  if (refusal) return { ...base, offers: [], ineligible: [], refusal };

  const pricing: ProfilePricing = priceProfile(input);
  const target = [minLevelFor(wanted), input.coverageLevel ?? 'tiers'].reduce<Level>((a, l) => (levelRank(l as Level) > levelRank(a) ? (l as Level) : a), 'tiers');

  const ineligible: SearchResult['ineligible'] = [];
  const candidates: Omit<PricedOffer, 'score'>[] = [];

  for (const o of cat.offers) {
    if (SCOPE_RULES[o.id]?.(input)) continue;
    const available = LEVELS.filter((l) => levelAvailable(o, l));
    if (!available.length) continue;
    // Cheapest formula that covers what the user wants, otherwise the most complete one.
    const level = available.find((l) => levelRank(l) >= levelRank(target)) ?? available[available.length - 1];
    const view = levelView(o, level);

    const matched: string[] = [];
    const missing: string[] = [];
    for (const code of wanted) {
      const c = coverage(view, code);
      if (c) matched.push(c === 'inclus' ? label(code) : `${label(code)} (${c})`);
      else missing.push(label(code));
    }
    if (input.coverageLevel && levelRank(level) < levelRank(input.coverageLevel)) missing.push(`formule ${LEVEL_LABEL[input.coverageLevel]}`);

    const annual = annualPremium(pricing, o.bases.tiers!.annual, o.bases[level]!.annual);
    const monthly = round2(annual / 12);
    const fr = view.frProduct;
    const factors = [
      ...pricing.factors,
      ...(level !== 'tiers' ? [{ key: 'dommages', label: `Valeur du véhicule et franchise ${input.deductible} (garanties dommages)`, coef: pricing.coefDommages }] : []),
    ]
      .filter((f) => Math.abs(f.coef - 1) >= 0.02)
      .sort((a, b) => Math.abs(Math.log(b.coef)) - Math.abs(Math.log(a.coef)))
      .slice(0, 5)
      .map((f) => ({ label: f.label, coef: round2(f.coef) }));

    const deductible =
      o.deductibleMin !== null
        ? o.deductibleMin === o.deductibleMax
          ? `franchise ${o.deductibleMin} €`
          : `franchise ${o.deductibleMin} à ${o.deductibleMax} €`
        : fr?.deductibleText ?? 'franchise selon contrat';

    const adv = o.advertised[level];
    const baseSource = o.bases[level]!.source;
    candidates.push({
      id: `${o.id}:${level}`,
      insurer: o.insurer,
      name: o.name,
      level,
      coverageLevel: LEVEL_LABEL[level],
      monthlyPremium: monthly,
      annualPremium: Math.round(annual),
      withinBudget: monthly <= input.maxMonthlyBudget,
      deductible,
      guarantees: [...view.included].map(label),
      options: [...view.options].map(label),
      matchedGuarantees: matched,
      missingGuarantees: missing,
      priceFactors: factors,
      priceSource: baseSource.startsWith('référence')
        ? 'tarif estimé à partir de la référence du marché (prix non publié par l’assureur)'
        : `tarif estimé à partir du ${baseSource}`,
      advertisedFrom: adv ? { monthly: adv.monthly, formula: adv.formula, profile: adv.profile } : null,
      exclusions: fr ? fr.exclusions.slice(0, 4) : o.notCovered ? [o.notCovered.slice(0, 300)] : [],
      restrictions: fr ? fr.restrictions.slice(0, 3) : [],
      sourceUrl: fr?.sourceUrl ?? o.sourceUrl,
      notes: o.monthlyPayment ? 'paiement mensuel possible' : '',
    });
  }

  const cheapest = Math.min(...candidates.map((c) => c.monthlyPremium));
  const scored: PricedOffer[] = candidates
    .map((c) => {
      const items = wanted.length + (input.coverageLevel ? 1 : 0);
      const guaranteeScore = items ? (items - c.missingGuarantees.length) / items : 1;
      const budget = input.maxMonthlyBudget;
      const budgetScore = c.withinBudget ? 1 : Math.max(0, 1 - (c.monthlyPremium - budget) / budget);
      const priceScore = cheapest / c.monthlyPremium;
      return { ...c, score: +(0.5 * guaranteeScore + 0.3 * budgetScore + 0.2 * priceScore).toFixed(3) };
    })
    .sort((a, b) => b.score - a.score || a.monthlyPremium - b.monthlyPremium);

  // One offer per insurer.
  const seen = new Set<string>();
  const offers = scored.filter((o) => !seen.has(o.insurer) && seen.add(o.insurer)).slice(0, topK);

  if (offers.length && !offers.some((o) => o.withinBudget))
    base.assumptions.push(
      `Aucune offre ne rentre dans le budget de ${input.maxMonthlyBudget} €/mois pour ce profil ; la moins chère du catalogue est à ${cheapest} €/mois.`,
    );
  return { ...base, offers, ineligible, refusal: null };
}
