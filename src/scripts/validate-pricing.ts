// Checks the rebuilt pricing model (src/mastra/offers/pricing.ts) against the database:
//  1. every France / auto row of objectif1.offres_prix_profils is recomputed from its profile;
//  2. a sample end-to-end search runs on the live catalogue.
// Run with: npm run validate:pricing   (read-only, no LLM needed)

import { query, SCHEMA as S } from '../mastra/db';
import { loadCatalogue } from '../mastra/offers/catalogue';
import { annualPremium, priceProfile, type Level, type PricingInput } from '../mastra/offers/pricing';
import { searchOffers } from '../mastra/offers/search';

interface Row {
  id_profil: string;
  id_offre: string;
  formule: Level;
  statut: string;
  profil_age: number;
  profil_annees_permis: number;
  profil_conduite_accompagnee: boolean;
  profil_pays_permis: string;
  profil_puissance_ch: number;
  profil_energie: PricingInput['energy'];
  profil_valeur_neuve_eur: number;
  profil_age_vehicule: number;
  profil_zone: PricingInput['zone'];
  profil_usage: PricingInput['usage'];
  profil_km_an: number;
  profil_stationnement: PricingInput['parking'];
  profil_franchise: PricingInput['deductible'];
  coef_bonus_malus: number;
  prix_base_annuel: number;
  base_tiers: number;
  prix_annuel_estime: number;
}

async function main() {
  console.log('1. Recomputing objectif1.offres_prix_profils (France, auto)…');
  const rows = await query<Row>(`
    select o.id_profil, o.id_offre, o.formule, o.statut, o.profil_age::int, o.profil_annees_permis::int, o.profil_conduite_accompagnee,
           o.profil_pays_permis, o.profil_puissance_ch::int, o.profil_energie, o.profil_valeur_neuve_eur::int, o.profil_age_vehicule::int,
           o.profil_zone, o.profil_usage, o.profil_km_an::int, o.profil_stationnement, o.profil_franchise, o.coef_bonus_malus::float8,
           o.prix_base_annuel::float8, t.prix_base_annuel::float8 base_tiers, o.prix_annuel_estime::float8
    from ${S}.offres_prix_profils o
    join ${S}.offres_prix_profils t on t.id_profil = o.id_profil and t.id_offre = o.id_offre and t.formule = 'tiers'
    where o.pays = 'France' and o.type = 'auto' and o.statut = 'ok'`);

  const errors: number[] = [];
  let worst = { rel: 0, row: null as Row | null, got: 0 };
  for (const r of rows) {
    const pricing = priceProfile({
      age: r.profil_age,
      licenseYears: r.profil_annees_permis,
      accompaniedDriving: r.profil_conduite_accompagnee,
      licenceOrigin: r.profil_pays_permis === 'hors_UE' ? 'hors_ue' : r.profil_pays_permis === 'UE' ? 'ue' : 'france',
      crm: r.coef_bonus_malus * 0.5, // the advisor asks the CRM directly
      power: r.profil_puissance_ch,
      energy: r.profil_energie,
      newPrice: r.profil_valeur_neuve_eur,
      vehicleAge: r.profil_age_vehicule,
      zone: r.profil_zone,
      usage: r.profil_usage,
      annualKm: r.profil_km_an,
      parking: r.profil_stationnement,
      deductible: r.profil_franchise,
    });
    const got = annualPremium(pricing, r.base_tiers, r.prix_base_annuel);
    const rel = Math.abs(got - r.prix_annuel_estime) / r.prix_annuel_estime;
    errors.push(rel);
    if (rel > worst.rel) worst = { rel, row: r, got };
  }
  errors.sort((a, b) => a - b);
  const pct = (q: number) => (errors[Math.floor(q * (errors.length - 1))] * 100).toFixed(3) + ' %';
  console.log(`   ${rows.length} rows | relative error median ${pct(0.5)} | p99 ${pct(0.99)} | max ${pct(1)}`);
  if (worst.row) console.log(`   worst: ${worst.row.id_profil} ${worst.row.id_offre} ${worst.row.formule} expected ${worst.row.prix_annuel_estime} got ${worst.got.toFixed(2)}`);
  const ok = errors[errors.length - 1] < 0.005;
  console.log(`   ${ok ? '✓' : '✗'} max error < 0.5 %`);

  console.log('\n2. Sample search on the live catalogue');
  const cat = await loadCatalogue();
  console.log(`   ${cat.offers.length} offers, ${cat.vehicles.length} vehicles, ${cat.communes.length} communes`);
  const res = searchOffers(cat, {
    age: 22, licenseYears: 1, accompaniedDriving: false, licenceOrigin: 'france', crm: 0.95, power: 90, energy: 'essence',
    newPrice: 19500, vehicleAge: 7, zone: 'urbain', usage: 'domicile_travail', annualKm: 10000, parking: 'rue',
    deductible: 'standard', atFaultClaims: 0, priorities: ['vol', 'bris de glace'], maxMonthlyBudget: 70,
  });
  for (const o of res.offers)
    console.log(`   - ${o.insurer} · ${o.name} · ${o.coverageLevel} · ${o.monthlyPremium} €/mois · score ${o.score} · manque: ${o.missingGuarantees.join(', ') || '—'}`);
  console.log(`   ineligible: ${res.ineligible.map((i) => i.name).join(' | ')}`);
  process.exit(ok && res.offers.length > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
