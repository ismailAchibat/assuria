import type { Level } from './pricing';

// Guarantee vocabulary = codes of objectif1.fr_types_garanties.
// Each code is linked to the yes/no column of offres_europe that announces it, and to the
// lowest formula that includes it (same split as fr_niveaux_offres.options_to_add).

export const LEVELS: Level[] = ['tiers', 'intermediaire', 'tous_risques'];
export const LEVEL_LABEL: Record<Level, string> = {
  tiers: 'Tiers',
  intermediaire: 'Tiers+ (vol, incendie, bris de glace)',
  tous_risques: 'Tous risques',
};
// prix_base says "intermediaire", the fr_* tables say "tiers_plus".
export const FR_LEVEL: Record<Level, 'tiers' | 'tiers_plus' | 'tous_risques'> = {
  tiers: 'tiers',
  intermediaire: 'tiers_plus',
  tous_risques: 'tous_risques',
};
export const levelRank = (l: Level) => LEVELS.indexOf(l);

export const FLAGS = [
  'g_responsabilite_civile',
  'g_vol',
  'g_incendie',
  'g_bris_de_glace',
  'g_dommages_vehicule',
  'g_catastrophes_naturelles',
  'g_assistance',
  'g_protection_conducteur',
  'g_protection_juridique',
  'g_equipements',
  'g_vehicule_remplacement',
] as const;
export type Flag = (typeof FLAGS)[number];

interface GuaranteeDef {
  flag?: Flag;
  // Included from this formula on. Without it, the guarantee is a service (included or optional
  // depending on the contract) that does not depend on the formula.
  level?: Level;
  synonyms: string[];
}

export const GUARANTEES: Record<string, GuaranteeDef> = {
  rc: { flag: 'g_responsabilite_civile', level: 'tiers', synonyms: ['responsabilite civile', 'rc', 'au tiers', 'dommages causes aux autres', 'dommages a autrui'] },
  defense_recours: { flag: 'g_protection_juridique', level: 'tiers', synonyms: ['defense penale', 'recours'] },
  protection_juridique: { flag: 'g_protection_juridique', synonyms: ['protection juridique', 'juridique', 'litige', 'avocat'] },
  conducteur: { flag: 'g_protection_conducteur', synonyms: ['garantie du conducteur', 'protection du conducteur', 'conducteur', 'dommages corporels', 'blessure', 'corporel'] },
  conducteur_renforce: { flag: 'g_protection_conducteur', synonyms: ['conducteur renforce', 'garantie conducteur renforcee'] },
  assistance: { flag: 'g_assistance', synonyms: ['assistance', 'depannage', 'remorquage'] },
  assistance_0km: { flag: 'g_assistance', synonyms: ['0 km', '0km', 'zero km', 'panne', 'assistance 0 km'] },
  vehicule_remplacement: { flag: 'g_vehicule_remplacement', synonyms: ['vehicule de remplacement', 'voiture de remplacement', 'vehicule de pret', 'voiture de pret', 'pret de vehicule'] },
  vol: { flag: 'g_vol', level: 'intermediaire', synonyms: ['vol', 'tentative de vol'] },
  incendie: { flag: 'g_incendie', level: 'intermediaire', synonyms: ['incendie', 'feu', 'explosion'] },
  bris_de_glace: { flag: 'g_bris_de_glace', level: 'intermediaire', synonyms: ['bris de glace', 'bris de glaces', 'pare-brise', 'pare brise', 'vitre', 'glace'] },
  evenements_climatiques: { flag: 'g_catastrophes_naturelles', level: 'intermediaire', synonyms: ['evenements climatiques', 'tempete', 'grele', 'inondation', 'climatique'] },
  cat_nat: { flag: 'g_catastrophes_naturelles', level: 'intermediaire', synonyms: ['catastrophe naturelle', 'catastrophes naturelles', 'cat nat'] },
  cat_tech: { flag: 'g_catastrophes_naturelles', level: 'intermediaire', synonyms: ['catastrophe technologique', 'catastrophes technologiques'] },
  attentats: { flag: 'g_catastrophes_naturelles', level: 'intermediaire', synonyms: ['attentat', 'terrorisme'] },
  vandalisme: { flag: 'g_dommages_vehicule', level: 'tous_risques', synonyms: ['vandalisme'] },
  dommages_collision: { flag: 'g_dommages_vehicule', level: 'tous_risques', synonyms: ['collision'] },
  dommages_tous_accidents: {
    flag: 'g_dommages_vehicule',
    level: 'tous_risques',
    synonyms: ['tous risques', 'tous accidents', 'dommages tous accidents', 'dommages au vehicule', 'dommages vehicule', 'accident responsable', 'dommages a ma voiture', 'dommages'],
  },
  contenu: { flag: 'g_equipements', synonyms: ['contenu', 'effets personnels', 'objets transportes'] },
  accessoires: { flag: 'g_equipements', synonyms: ['accessoires', 'equipements', 'amenagements'] },
  valeur_majoree: { synonyms: ['valeur a neuf', "valeur d'achat", 'valeur d achat', 'indemnisation majoree'] },
  perte_financiere_leasing: { synonyms: ['loa', 'lld', 'leasing', 'perte financiere', 'location avec option'] },
  panne_mecanique: { synonyms: ['panne mecanique', 'casse moteur'] },
  rachat_franchise: { synonyms: ['rachat de franchise'] },
};

// Guarantees of each formula (cumulative), used when an offer has no fr_* detail.
export const LEVEL_CODES: Record<Level, string[]> = {
  tiers: ['rc', 'defense_recours'],
  intermediaire: ['rc', 'defense_recours', 'vol', 'incendie', 'bris_de_glace', 'evenements_climatiques', 'cat_nat', 'cat_tech', 'attentats'],
  tous_risques: [
    'rc', 'defense_recours', 'vol', 'incendie', 'bris_de_glace', 'evenements_climatiques', 'cat_nat', 'cat_tech', 'attentats',
    'dommages_tous_accidents', 'dommages_collision', 'vandalisme',
  ],
};

export const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();

// Free-text priority ("le vol", "pare-brise") -> guarantee code, or null if not recognised.
// The longest matching synonym wins ("panne mecanique" beats "panne").
export function guaranteeCode(text: string): string | null {
  const t = normalize(text);
  if (t in GUARANTEES) return t;
  let best: { code: string; len: number } | null = null;
  for (const [code, def] of Object.entries(GUARANTEES)) {
    for (const syn of def.synonyms) {
      const hit = new RegExp(`(^|[^a-z])${syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(t);
      if (hit && (!best || syn.length > best.len)) best = { code, len: syn.length };
    }
  }
  return best?.code ?? null;
}

// Lowest formula needed to get all these guarantees.
export function minLevelFor(codes: string[]): Level {
  return codes.reduce<Level>((acc, c) => {
    const l = GUARANTEES[c]?.level;
    return l && levelRank(l) > levelRank(acc) ? l : acc;
  }, 'tiers');
}

// fr_stats_marche.guarantee for each code (to explain why a guarantee matters).
export const STATS_KEY: Record<string, string> = {
  bris_de_glace: 'bris_de_glace',
  vol: 'vol',
  incendie: 'incendie',
  dommages_tous_accidents: 'dommages',
  dommages_collision: 'dommages',
  vandalisme: 'dommages',
  conducteur: 'conducteur',
  conducteur_renforce: 'conducteur',
  rc: 'rc_materiels',
};
