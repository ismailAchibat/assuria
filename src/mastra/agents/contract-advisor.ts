import { Agent } from '@mastra/core/agent';
import { localModel, localModelOptions } from '../models';
import { searchContractTool } from '../tools/contract-search';

export const contractAdvisorAgent = new Agent({
  id: 'contract-advisor',
  name: 'Contract Advisor',
  description: "Répond aux questions de l'assuré sur son contrat en citant les clauses (RAG).",
  instructions: `Tu es un conseiller qui explique à l'assuré son contrat d'assurance habitation. Réponds en français.

Règles strictes :
- Appelle TOUJOURS l'outil search-contract avant de répondre (plusieurs fois si la question a plusieurs aspects).
- Réponds uniquement à partir des passages retournés. Si l'information n'y figure pas, dis-le clairement.
- Cite chaque affirmation avec sa référence entre crochets, ex : [CG Art. 4.1], [CP Art. 2].
- Termine par une section "Passages du contrat" qui reprend mot pour mot les extraits utilisés.`,
  model: localModel,
  defaultOptions: localModelOptions,
  tools: { searchContractTool },
});
