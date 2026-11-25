// Dummy insurance offers catalogue (fictional insurers, synthetic data).

export type ProductType = 'auto' | 'habitation' | 'sante';
export type CoverageLevel = 'essentiel' | 'confort' | 'premium';

export interface InsuranceOffer {
  id: string;
  insurer: string;
  product: ProductType;
  name: string;
  coverageLevel: CoverageLevel;
  monthlyPremium: number; // EUR
  deductible: number; // franchise, EUR
  guarantees: string[];
  exclusions: string[];
  notes: string;
  eligibility?: Eligibility;
}

// Hard subscription conditions, checked against the user profile.
export interface Eligibility {
  minAge?: number;
  maxAge?: number;
  minLicenseYears?: number;
  maxLicenseYears?: number; // exclusive: licenseYears < maxLicenseYears
  maxBonusMalus?: number;
  maxVehicleAge?: number; // years
  occupancy?: 'locataire' | 'proprietaire';
  housingType?: 'appartement' | 'maison';
  maxSurface?: number;
  studentOnly?: boolean;
  minChildren?: number;
}

export const offers: InsuranceOffer[] = [
  // --- Auto ---
  {
    id: 'AUTO-01',
    insurer: 'Assurance Loire',
    product: 'auto',
    name: 'Auto Tiers Simple',
    coverageLevel: 'essentiel',
    monthlyPremium: 24,
    deductible: 0,
    guarantees: ['responsabilité civile', 'défense pénale'],
    exclusions: ['dommages au véhicule assuré', 'vol', 'bris de glace'],
    notes: 'Minimum légal, adapté aux véhicules anciens de faible valeur.',
  },
  {
    id: 'AUTO-02',
    insurer: 'Mutuelle Sarthoise',
    product: 'auto',
    name: 'Auto Tiers Plus',
    coverageLevel: 'confort',
    monthlyPremium: 39,
    deductible: 250,
    guarantees: ['responsabilité civile', 'défense pénale', 'vol', 'incendie', 'bris de glace', 'assistance 0 km'],
    exclusions: ['dommages tous accidents'],
    notes: 'Bon compromis pour véhicule de 5 à 10 ans.',
  },
  {
    id: 'AUTO-03',
    insurer: 'Assurance Loire',
    product: 'auto',
    name: 'Auto Tous Risques Jeune Conducteur',
    coverageLevel: 'premium',
    monthlyPremium: 89,
    deductible: 600,
    guarantees: ['responsabilité civile', 'dommages tous accidents', 'vol', 'incendie', 'bris de glace', 'assistance 0 km', 'véhicule de remplacement'],
    exclusions: ['conduite sans permis', 'alcoolémie'],
    notes: 'Tarif réservé aux permis de moins de 3 ans, stage de conduite offert.',
    eligibility: { maxLicenseYears: 3 },
  },
  {
    id: 'AUTO-04',
    insurer: 'Atlantique Assur',
    product: 'auto',
    name: 'Auto Tous Risques Sérénité',
    coverageLevel: 'premium',
    monthlyPremium: 62,
    deductible: 300,
    guarantees: ['responsabilité civile', 'dommages tous accidents', 'vol', 'incendie', 'bris de glace', 'assistance 0 km', 'protection du conducteur', 'valeur à neuf 2 ans'],
    exclusions: ['usage professionnel non déclaré'],
    notes: 'Pour conducteurs expérimentés (bonus >= 0.70) et véhicules récents.',
    eligibility: { minLicenseYears: 3, maxBonusMalus: 0.7, maxVehicleAge: 5 },
  },
  // --- Habitation ---
  {
    id: 'HAB-01',
    insurer: 'Mutuelle Sarthoise',
    product: 'habitation',
    name: 'Habitation Étudiant',
    coverageLevel: 'essentiel',
    monthlyPremium: 6,
    deductible: 150,
    guarantees: ['responsabilité civile', 'dégâts des eaux', 'incendie'],
    exclusions: ['vol sans effraction', 'objets de valeur > 1500 €'],
    notes: 'Logements de moins de 35 m², locataires de moins de 28 ans.',
    eligibility: { maxAge: 27, studentOnly: true, occupancy: 'locataire', maxSurface: 35 },
  },
  {
    id: 'HAB-02',
    insurer: 'Atlantique Assur',
    product: 'habitation',
    name: 'Habitation Locataire Confort',
    coverageLevel: 'confort',
    monthlyPremium: 14,
    deductible: 200,
    guarantees: ['responsabilité civile', 'dégâts des eaux', 'incendie', 'vol', 'bris de glace', 'catastrophes naturelles'],
    exclusions: ['jardin et dépendances'],
    notes: 'Appartement jusqu’à 4 pièces.',
    eligibility: { occupancy: 'locataire', housingType: 'appartement' },
  },
  {
    id: 'HAB-03',
    insurer: 'Assurance Loire',
    product: 'habitation',
    name: 'Multirisque Propriétaire Premium',
    coverageLevel: 'premium',
    monthlyPremium: 38,
    deductible: 300,
    guarantees: ['responsabilité civile', 'dégâts des eaux', 'incendie', 'vol', 'bris de glace', 'catastrophes naturelles', 'rééquipement à neuf', 'jardin et piscine', 'assistance dépannage'],
    exclusions: ['défaut d’entretien manifeste'],
    notes: 'Maisons individuelles, couverture des dépendances incluse.',
    eligibility: { occupancy: 'proprietaire', housingType: 'maison' },
  },
  // --- Santé ---
  {
    id: 'SANTE-01',
    insurer: 'Mutuelle Sarthoise',
    product: 'sante',
    name: 'Santé Essentielle',
    coverageLevel: 'essentiel',
    monthlyPremium: 28,
    deductible: 0,
    guarantees: ['hospitalisation 100%', 'soins courants 100% BR'],
    exclusions: ['optique', 'dentaire prothèses', 'médecines douces'],
    notes: 'Adaptée aux jeunes en bonne santé.',
  },
  {
    id: 'SANTE-02',
    insurer: 'Atlantique Assur',
    product: 'sante',
    name: 'Santé Famille Confort',
    coverageLevel: 'confort',
    monthlyPremium: 95,
    deductible: 0,
    guarantees: ['hospitalisation 200%', 'soins courants 150% BR', 'optique 250 €/an', 'dentaire 200%', 'maternité 400 €'],
    exclusions: ['chirurgie esthétique'],
    notes: 'Tarif pour 2 adultes + enfants (enfants gratuits à partir du 3e).',
    eligibility: { minChildren: 1 },
  },
  {
    id: 'SANTE-03',
    insurer: 'Assurance Loire',
    product: 'sante',
    name: 'Santé Senior Premium',
    coverageLevel: 'premium',
    monthlyPremium: 140,
    deductible: 0,
    guarantees: ['hospitalisation 300%', 'soins courants 200% BR', 'optique 400 €/an', 'dentaire 300%', 'audioprothèses 1000 €', 'médecines douces 150 €/an'],
    exclusions: ['cures thermales non prescrites'],
    notes: 'À partir de 60 ans.',
    eligibility: { minAge: 60 },
  },
];
