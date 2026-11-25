import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { profileSchema } from '../agents/profile-extractor';
import { profileFieldsSchema, type UserProfile } from '../profile';
import { enrichProfile, searchForProfile } from '../tools/offers';

// Hybrid pipeline: small LLM extracts a profile -> database lookup + deterministic pricing/ranking ->
// LLM writes an explained recommendation grounded in the ranked offers (or asks what is missing).

const searchSchema = z.object({
  status: z.enum(['ok', 'missing_info']),
  missing: z.array(z.object({ field: z.string(), label: z.string(), question: z.string() })),
  offers: z.array(z.any()),
  refusal: z.string().nullable(),
  assumptions: z.array(z.string()),
  marketStats: z.array(z.string()),
});

const extractProfile = createStep({
  id: 'extract-profile',
  inputSchema: z.object({ userMessage: z.string() }),
  outputSchema: z.object({ userMessage: z.string(), profile: profileSchema }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent('profileExtractorAgent');
    const res = await agent.generate(inputData.userMessage, {
      structuredOutput: { schema: profileSchema },
    });
    return { userMessage: inputData.userMessage, profile: res.object };
  },
});

const rank = createStep({
  id: 'rank-offers',
  inputSchema: z.object({ userMessage: z.string(), profile: profileSchema }),
  outputSchema: z.object({ userMessage: z.string(), profile: profileSchema, search: searchSchema }),
  execute: async ({ inputData }) => {
    // nulls -> absent, then the same parsing/aliases as the advisor's update-profile tool,
    // field by field so that one invalid value does not drop the others.
    const profile: UserProfile = {};
    for (const [key, value] of Object.entries(inputData.profile)) {
      const field = profileFieldsSchema.shape[key as keyof UserProfile];
      const parsed = value === null || !field ? undefined : field.safeParse(value);
      if (parsed?.success && parsed.data !== undefined) (profile as Record<string, unknown>)[key] = parsed.data;
    }
    await enrichProfile(profile, {}, profile);
    const search = await searchForProfile(profile);
    return { ...inputData, search };
  },
});

const recommend = createStep({
  id: 'write-recommendation',
  inputSchema: z.object({ userMessage: z.string(), profile: profileSchema, search: searchSchema }),
  outputSchema: z.object({ profile: profileSchema, search: searchSchema, recommendation: z.string() }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent('offerAdvisorAgent');
    const { search } = inputData;
    const prompt =
      search.status === 'missing_info'
        ? `Message de l'utilisateur : """${inputData.userMessage}"""

Le profil est incomplet. Informations manquantes : ${search.missing.map((m) => m.label).join(', ')}.
Remercie l'utilisateur et pose les 2 ou 3 questions les plus importantes parmi celles-ci (sans appeler d'outil, sans citer d'offre).`
        : `Message de l'utilisateur : """${inputData.userMessage}"""

Résultat de la recherche (offres classées, ne pas en ajouter d'autres) :
${JSON.stringify({ offers: search.offers, refusal: search.refusal, assumptions: search.assumptions, marketStats: search.marketStats }, null, 2)}

Rédige la recommandation finale (sans appeler d'outil).`;
    const res = await agent.generate(prompt, { toolChoice: 'none' });
    return { profile: inputData.profile, search, recommendation: res.text };
  },
});

export const offerPersonalizationWorkflow = createWorkflow({
  id: 'offer-personalization',
  inputSchema: z.object({ userMessage: z.string() }),
  outputSchema: z.object({ profile: profileSchema, search: searchSchema, recommendation: z.string() }),
})
  .then(extractProfile)
  .then(rank)
  .then(recommend)
  .commit();
