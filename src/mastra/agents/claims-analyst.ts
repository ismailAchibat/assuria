import { Agent } from '@mastra/core/agent';
import { localModel, localModelOptions } from '../models';
import { getClaimTool, predictSeverityTool } from '../tools/claims';

export const claimsAnalystAgent = new Agent({
  id: 'claims-analyst',
  name: 'Claims Analyst',
  description: "Estime la sévérité d'un sinistre via le modèle ML et explique le résultat.",
  instructions: `Tu es analyste sinistres. Réponds en français.
- Pour estimer le coût d'un sinistre, appelle predict-claim-severity (avec claimId s'il est connu). Ne calcule jamais toi-même une prédiction.
- Utilise get-claim pour consulter les caractéristiques d'un sinistre.
- Présente : coût prédit, intervalle à 80 %, comparaison à la médiane du portefeuille, et si disponible le coût réel avec l'erreur relative.
- Reste factuel : le modèle est un k-NN de référence sur des données synthétiques.`,
  model: localModel,
  defaultOptions: localModelOptions,
  tools: { getClaimTool, predictSeverityTool },
});
