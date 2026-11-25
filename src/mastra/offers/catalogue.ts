import { query, SCHEMA as S } from '../db';
import { FLAGS, FR_LEVEL, LEVELS, normalize, type Flag } from './guarantees';
import type { Energy, Level, Zone } from './pricing';

// France car-insurance catalogue, loaded once from the `objectif1` schema and kept in memory
// (a few hundred rows). Offers and base prices come from offres_europe + prix_base; offers that
// match one of the detailed French products get the fr_* data (guarantees, caps, exclusions, sources).

// offres_europe.id_offre -> fr_produits.product_id, per formula (ids differ between the two groups of tables).
const FR_PRODUCT_OF_OFFER: Record<string, Partial<Record<Level, string>>> = {
  fr_lolivier_auto: { tiers: 'lolivier_tiers_essentiel', intermediaire: 'lolivier_tous_risques', tous_risques: 'lolivier_tous_risques' },
  fr_luko_allianz_direct_auto_0944ae: all('luko_allianz_direct'),
  fr_macif_auto_60c1a9: all('macif_auto'),
  fr_maaf_auto_91457d: all('maaf_auto'),
  fr_maif_auto_f359ae: all('maif_vam'),
  fr_matmut_auto: all('matmut_auto_4d'),
  fr_direct_assurance_auto: all('direct_assurance_auto'),
};
function all(id: string): Record<Level, string> {
  return { tiers: id, intermediaire: id, tous_risques: id };
}
// Offers whose product sheets are per formula: show a neutral product name.
const DISPLAY_NAME: Record<string, string> = { fr_lolivier_auto: 'Assurance auto' };

export interface FrGuarantee {
  code: string;
  label: string;
  status: 'included' | 'optional' | 'ambiguous';
  ceiling: string | null;
}

export interface FrProduct {
  id: string;
  brand: string;
  insurer: string;
  name: string;
  sourceUrl: string | null;
  docDate: string | null;
  deductibleText: string | null;
  guarantees: FrGuarantee[];
  exclusions: string[];
  restrictions: string[];
  levels: Partial<Record<'tiers' | 'tiers_plus' | 'tous_risques', { available: boolean; add: string[]; notOffered: string[] }>>;
}

export interface AdvertisedPrice {
  monthly: number;
  formula: string;
  profile: string;
  sourceUrl: string | null;
}

export interface CatalogueOffer {
  id: string;
  insurer: string;
  name: string;
  sourceUrl: string | null;
  flags: Record<Flag, boolean>;
  deductibleMin: number | null;
  deductibleMax: number | null;
  monthlyPayment: boolean;
  notCovered: string | null;
  bases: Partial<Record<Level, { annual: number; source: string }>>;
  fr: Partial<Record<Level, FrProduct>>;
  advertised: Partial<Record<Level, AdvertisedPrice>>;
}

export interface Vehicle {
  model: string;
  category: string;
  energy: Energy;
  power: number;
  newPrice: number;
}

export interface Commune {
  name: string;
  postalCode: string;
  zone: Zone;
}

export interface MarketStat {
  guarantee: string;
  metric: string;
  value: number;
  unit: string;
  year: number;
  source: string;
}

export interface Catalogue {
  offers: CatalogueOffer[];
  vehicles: Vehicle[];
  communes: Commune[];
  guaranteeLabels: Map<string, string>;
  marketStats: MarketStat[];
  loadedAt: Date;
}

// Reference profiles of the published "à partir de" prices (fr_prix_a_partir_de.profile_key).
const PROFILE_DESC: Record<string, string> = {
  bonus_experienced: 'conducteur de 50 ans, 30 ans de permis, bonus 50 %, Clio à Nantes',
  insurer_example: "exemple de tarif publié par l'assureur",
};

const clean = (s: string | null) =>
  s ? s.replace(/[\u0000-\u001f]/g, ' ').replace(/\/checkbld/g, '').replace(/\s+/g, ' ').trim() : null;

async function fetchCatalogue(): Promise<Catalogue> {
  const [offers, bases, products, guarantees, conditions, levels, prices, types, stats, vehicles, communes] = await Promise.all([
    query<Record<string, unknown>>(
      `select id_offre, assureur, produit, url_source, franchise_min_eur::float8, franchise_max_eur::float8, paiement_mensuel, non_assure, ${FLAGS.join(', ')}
       from ${S}.offres_europe where pays = 'France' and type = 'auto' order by assureur, id_offre`,
    ),
    query<{ id_offre: string; formule: Level; prix_base_annuel: number; source_prix_base: string }>(
      `select id_offre, formule, prix_base_annuel::float8, source_prix_base from ${S}.prix_base where pays = 'France' and type = 'auto'`,
    ),
    query<{ product_id: string; brand: string; insurer: string; product_name: string; source_url: string | null; doc_date: string | null; deductible_text: string | null }>(
      `select product_id, brand, insurer, product_name, source_url, doc_date, deductible_text from ${S}.fr_produits`,
    ),
    query<{ product_id: string; code: string; status: FrGuarantee['status']; label: string; ceiling_text: string | null }>(
      `select product_id, code, status, label, ceiling_text from ${S}.fr_garanties_produits order by guarantee_id`,
    ),
    query<{ product_id: string; kind: 'exclusion' | 'restriction'; text: string }>(`select product_id, kind, text from ${S}.fr_conditions_produits`),
    query<{ product_id: string; level: 'tiers' | 'tiers_plus' | 'tous_risques'; available: string; options_to_add: string; not_offered: string }>(
      `select product_id, level, available::text, options_to_add::text, not_offered::text from ${S}.fr_niveaux_offres`,
    ),
    query<{ brand: string; level: string; price_from_eur_month: number; cheapest_formula: string; profile_key: string; source_url: string | null }>(
      `select brand, level, price_from_eur_month::float8, cheapest_formula, profile_key, source_url from ${S}.fr_prix_a_partir_de`,
    ),
    query<{ code: string; label_fr: string }>(`select code, label_fr from ${S}.fr_types_garanties`),
    query<{ guarantee: string; metric: string; value: number; unit: string; data_year: number; source_org: string }>(
      `select guarantee, metric, value::float8, unit, data_year::int, source_org from ${S}.fr_stats_marche`,
    ),
    // Vehicles known to the questionnaire (profils) and to the priced sample drivers (offres_prix_profils).
    query<{ model: string; category: string; energy: Energy; power: number; new_price: number }>(
      `select model, category, energy, power, new_price from (
         select marque_modele model, categorie_vehicule category, energie energy, puissance_ch::int power, prix_neuf_eur::int new_price, 0 src
         from ${S}.profils where type_vehicule = 'auto' and pays_residence = 'France'
         union
         select profil_vehicule, profil_categorie_vehicule, profil_energie, profil_puissance_ch::int, profil_valeur_neuve_eur::int, 1
         from ${S}.offres_prix_profils where type = 'auto' and pays = 'France'
       ) v order by src, model`,
    ),
    query<{ commune: string; code_postal: string; type_zone: Zone }>(
      `select distinct commune, code_postal, type_zone from ${S}.profils where pays_residence = 'France' order by commune`,
    ),
  ]);

  const pgArray = (s: string) => s.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
  const frProducts = new Map<string, FrProduct>(
    products.map((p) => [
      p.product_id,
      {
        id: p.product_id,
        brand: p.brand,
        insurer: p.insurer,
        name: p.product_name,
        sourceUrl: p.source_url,
        docDate: p.doc_date,
        deductibleText: p.deductible_text,
        guarantees: [],
        exclusions: [],
        restrictions: [],
        levels: {},
      },
    ]),
  );
  for (const g of guarantees)
    frProducts.get(g.product_id)?.guarantees.push({ code: g.code, label: g.label, status: g.status, ceiling: g.ceiling_text });
  for (const c of conditions) frProducts.get(c.product_id)?.[c.kind === 'exclusion' ? 'exclusions' : 'restrictions'].push(c.text);
  for (const l of levels) {
    const p = frProducts.get(l.product_id);
    if (p) p.levels[l.level] = { available: l.available === 'true' || l.available === 't', add: pgArray(l.options_to_add), notOffered: pgArray(l.not_offered) };
  }

  const catalogueOffers: CatalogueOffer[] = offers.map((o) => {
    const id = o.id_offre as string;
    const frIds = FR_PRODUCT_OF_OFFER[id] ?? {};
    const fr: CatalogueOffer['fr'] = {};
    const advertised: CatalogueOffer['advertised'] = {};
    const offerBases: CatalogueOffer['bases'] = {};
    for (const b of bases.filter((b) => b.id_offre === id)) offerBases[b.formule] = { annual: b.prix_base_annuel, source: b.source_prix_base };
    for (const level of LEVELS) {
      const product = frIds[level] ? frProducts.get(frIds[level]!) : undefined;
      if (!product) continue;
      fr[level] = product;
      const price = prices.find((p) => p.brand === product.brand && p.level === FR_LEVEL[level]);
      if (price)
        advertised[level] = {
          monthly: price.price_from_eur_month,
          formula: price.cheapest_formula,
          profile: PROFILE_DESC[price.profile_key] ?? price.profile_key,
          sourceUrl: price.source_url,
        };
    }
    const main = fr.tous_risques ?? fr.intermediaire ?? fr.tiers;
    return {
      id,
      insurer: main?.brand ?? (o.assureur as string),
      name: DISPLAY_NAME[id] ?? main?.name ?? (o.produit as string),
      sourceUrl: main?.sourceUrl ?? (o.url_source as string | null),
      flags: Object.fromEntries(FLAGS.map((f) => [f, o[f] === true])) as Record<Flag, boolean>,
      deductibleMin: o.franchise_min_eur as number | null,
      deductibleMax: o.franchise_max_eur as number | null,
      monthlyPayment: o.paiement_mensuel === true,
      notCovered: clean(o.non_assure as string | null),
      bases: offerBases,
      fr,
      advertised,
    };
  });

  // First occurrence wins (questionnaire names before sample-driver names).
  const seen = new Set<string>();
  const uniqueVehicles = vehicles
    .filter((v) => v.model && !seen.has(normalize(v.model)) && seen.add(normalize(v.model)))
    .map((v) => ({ model: v.model, category: v.category, energy: v.energy, power: v.power, newPrice: v.new_price }));

  return {
    offers: catalogueOffers,
    vehicles: uniqueVehicles,
    communes: communes.map((c) => ({ name: c.commune, postalCode: c.code_postal, zone: c.type_zone })),
    guaranteeLabels: new Map(types.map((t) => [t.code, t.label_fr])),
    marketStats: stats.map((s) => ({ guarantee: s.guarantee, metric: s.metric, value: s.value, unit: s.unit, year: s.data_year, source: s.source_org })),
    loadedAt: new Date(),
  };
}

let cache: Promise<Catalogue> | null = null;

export function loadCatalogue(): Promise<Catalogue> {
  cache ??= fetchCatalogue().catch((err) => {
    cache = null; // retry on next call
    throw err;
  });
  return cache;
}

// --- Lookups used while building the profile ---

// "clio" / "Renault Clio 4" / "golf gti" -> catalogue vehicle. Every word typed must appear in the
// model name; among several matches the shortest name (base model) wins.
const BRAND_ALIASES: Record<string, string> = { vw: 'volkswagen', merco: 'mercedes', benz: 'mercedes' };

export function findVehicle(cat: Catalogue, text: string): Vehicle | null {
  const words = normalize(text)
    .split(/[^a-z0-9]+/)
    .map((w) => BRAND_ALIASES[w] ?? w)
    .filter((w) => w.length > 1 && !/^(19|20)\d\d$/.test(w));
  if (!words.length) return null;
  const matches = cat.vehicles.filter((v) => {
    const name = normalize(v.model).split(/[^a-z0-9]+/);
    return words.every((w) => name.includes(w));
  });
  return matches.sort((a, b) => a.model.length - b.model.length)[0] ?? null;
}

// "Le Mans" / "au Mans" / "Mans" / "72000" / "Paris" -> commune with its zone type.
const withoutArticle = (s: string) =>
  normalize(s).replace(/-/g, ' ').replace(/^(le|la|les|au|aux|a|en)\s+|^l'\s*/, '').trim();

export function findCommune(cat: Catalogue, text: string): Commune | null {
  const t = withoutArticle(text);
  const byPostal = /^\d{5}$/.test(t) ? cat.communes.find((c) => c.postalCode === t) : undefined;
  if (byPostal) return byPostal;
  return (
    cat.communes.find((c) => withoutArticle(c.name) === t) ??
    cat.communes.find((c) => withoutArticle(c.name).startsWith(t + ' ')) ?? // "paris" -> "Paris 15e"
    null
  );
}
