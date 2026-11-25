import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { localModel, localModelOptions } from '../models';

// Small-LLM role from the project brief: extract useful info from free text
// into a structured profile before handing off to ranking / a bigger model.
// Same fields as the offer advisor's profile (src/mastra/profile.ts), null when absent.

export const profileSchema = z.object({
  age: z.number().nullable(),
  licenseYears: z.number().nullable().describe("Années de permis"),
  accompaniedDriving: z.boolean().nullable().describe('Conduite accompagnée'),
  licenceOrigin: z.enum(['france', 'ue', 'hors_ue']).nullable().describe('Pays du permis'),
  bonusMalus: z.number().nullable().describe('Coefficient bonus-malus (CRM), ex 0.85'),
  atFaultClaims: z.number().nullable().describe('Sinistres responsables ces 3 dernières années'),
  vehicle: z.string().nullable().describe('Marque et modèle'),
  vehicleYear: z.number().nullable().describe('Année de mise en circulation'),
  usage: z.enum(['prive', 'domicile_travail', 'professionnel']).nullable(),
  annualKm: z.number().nullable(),
  parking: z.enum(['garage', 'parking', 'rue']).nullable(),
  city: z.string().nullable().describe('Commune de résidence'),
  priorities: z.array(z.string()).describe('Garanties souhaitées, ex ["vol", "bris de glace"]'),
  coverageLevel: z.enum(['tiers', 'intermediaire', 'tous_risques']).nullable(),
  maxMonthlyBudget: z.number().nullable(),
});

export type Profile = z.infer<typeof profileSchema>;

export const profileExtractorAgent = new Agent({
  id: 'profile-extractor',
  name: 'Profile Extractor',
  description: "Extrait un profil de conducteur structuré à partir d'un message libre.",
  instructions: `Tu extrais le profil d'un futur assuré AUTO à partir de son message, en français.
- N'invente rien : si une information est absente, mets null (ou une liste vide).
- licenseYears : nombre d'années de permis ("permis depuis un an" = 1).
- usage : "pour aller au travail" = domicile_travail.
- priorities : termes simples ("vol", "bris de glace", "tous risques", "assistance 0 km", "véhicule de remplacement"...).`,
  model: localModel,
  defaultOptions: localModelOptions,
});
