import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { CAT_FEATURES, CONT_FEATURES, claims, type Claim } from '../../data/claims';

// Baseline ML model: k-NN regressor on log(loss) with a Gower-style distance.
// Stands in for the classical model (GBM, etc.) to be benchmarked later.

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

function distance(a: Pick<Claim, 'cat' | 'cont'>, b: Claim) {
  let d = 0;
  let n = 0;
  for (const f of CAT_FEATURES) {
    if (a.cat[f] === undefined) continue;
    d += a.cat[f] === b.cat[f] ? 0 : 1;
    n++;
  }
  for (const f of CONT_FEATURES) {
    if (a.cont[f] === undefined) continue;
    d += Math.abs(a.cont[f] - b.cont[f]);
    n++;
  }
  return n ? d / n : 0;
}

export function predictSeverity(features: Pick<Claim, 'cat' | 'cont'>, excludeId?: number, k = 15) {
  const neighbours = claims
    .filter((c) => c.id !== excludeId)
    .map((c) => ({ c, d: distance(features, c) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, k);

  const logs = neighbours.map((n) => Math.log(n.c.loss));
  const predicted = Math.exp(logs.reduce((s, x) => s + x, 0) / logs.length);
  const losses = neighbours.map((n) => n.c.loss).sort((x, y) => x - y);

  return {
    predictedLoss: +predicted.toFixed(2),
    interval80: [quantile(losses, 0.1), quantile(losses, 0.9)] as [number, number],
    neighbourIds: neighbours.map((n) => n.c.id),
    datasetMedianLoss: quantile([...claims.map((c) => c.loss)].sort((x, y) => x - y), 0.5),
  };
}

const featuresSchema = z.object({
  cat: z.record(z.string(), z.string()).describe('Variables catégorielles cat1..cat6 (valeurs A, B, C...)'),
  cont: z.record(z.string(), z.number()).describe('Variables continues cont1..cont5 dans [0,1]'),
});

export const getClaimTool = createTool({
  id: 'get-claim',
  description: 'Récupère un sinistre du jeu de données (caractéristiques et coût réel) par son identifiant.',
  inputSchema: z.object({ id: z.number().int().describe('Identifiant du sinistre') }),
  outputSchema: z.object({ found: z.boolean(), claim: z.any().optional() }),
  execute: async ({ id }) => {
    const claim = claims.find((c) => c.id === id);
    return claim ? { found: true, claim } : { found: false };
  },
});

export const predictSeverityTool = createTool({
  id: 'predict-claim-severity',
  description:
    "Prédit le coût (sévérité) d'un sinistre avec le modèle ML de référence (k-NN) à partir de ses caractéristiques. Donner claimId pour exclure ce sinistre de l'entraînement (évaluation honnête).",
  inputSchema: z.object({
    claimId: z.number().int().optional().describe('Identifiant du sinistre à prédire (exclu des voisins)'),
    features: featuresSchema.optional().describe('Caractéristiques, si le sinistre n’est pas dans le jeu de données'),
  }),
  outputSchema: z.object({
    predictedLoss: z.number(),
    interval80: z.tuple([z.number(), z.number()]),
    neighbourIds: z.array(z.number()),
    datasetMedianLoss: z.number(),
    actualLoss: z.number().optional(),
  }),
  execute: async ({ claimId, features }) => {
    const claim = claimId !== undefined ? claims.find((c) => c.id === claimId) : undefined;
    const input = claim ?? features;
    if (!input) throw new Error('Provide either a valid claimId or features');
    return { ...predictSeverity(input, claim?.id), actualLoss: claim?.loss };
  },
});
