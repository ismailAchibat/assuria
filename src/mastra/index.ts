import { chatRoute } from '@mastra/ai-sdk';
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { claimsAnalystAgent } from './agents/claims-analyst';
import { contractAdvisorAgent } from './agents/contract-advisor';
import { offerAdvisorAgent } from './agents/offer-advisor';
import { profileExtractorAgent } from './agents/profile-extractor';
import { offerPersonalizationWorkflow } from './workflows/offer-personalization';

export const mastra = new Mastra({
  agents: { profileExtractorAgent, offerAdvisorAgent, contractAdvisorAgent, claimsAnalystAgent },
  workflows: { offerPersonalizationWorkflow },
  storage: new LibSQLStore({ id: 'assuria-storage', url: 'file:./mastra.db' }),
  server: {
    // AI SDK (useChat) compatible streaming endpoint: POST /chat/<agent-id>
    apiRoutes: [chatRoute({ path: '/chat/:agentId', version: 'v7', defaultOptions: { maxSteps: 5 } })],
  },
});
