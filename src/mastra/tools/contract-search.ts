import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { contractChunks, contractMeta } from '../../data/contract';

// Lexical retriever (BM25) over contract articles.
// Placeholder for the embedding-based RAG (Ollama embeddings + vector store).

const STOPWORDS = new Set(
  'le la les un une des du de d l et ou a au aux en dans par pour sur avec sans est sont ce ces qui que quoi mon ma mes je j il elle on nous vous ils pas ne se s si y cas est-ce suis ai'.split(' '),
);

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => t.slice(0, 6)); // crude stemming: "franchises" ~ "franchise"

const docs = contractChunks.map((c) => tokenize(`${c.title} ${c.title} ${c.text}`));
const avgLen = docs.reduce((s, d) => s + d.length, 0) / docs.length;
const df = new Map<string, number>();
for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);

export function searchContract(query: string, topK = 3) {
  const q = tokenize(query);
  const k1 = 1.4;
  const b = 0.75;
  const N = docs.length;
  return contractChunks
    .map((chunk, i) => {
      const d = docs[i];
      let score = 0;
      for (const t of q) {
        const tf = d.filter((x) => x === t).length;
        if (!tf) continue;
        const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
        score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avgLen));
      }
      return { ...chunk, score: +score.toFixed(3) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export const searchContractTool = createTool({
  id: 'search-contract',
  description:
    "Recherche les clauses pertinentes dans le contrat d'assurance habitation de l'assuré (conditions générales CG et particulières CP). Retourne les passages avec leur référence d'article.",
  inputSchema: z.object({
    query: z.string().describe('Question ou mots-clés à rechercher dans le contrat'),
    topK: z.number().int().min(1).max(6).optional().describe('Nombre de passages (défaut 3)'),
  }),
  outputSchema: z.object({
    contract: z.object({ contractNumber: z.string(), insurer: z.string(), product: z.string() }),
    passages: z.array(z.object({ ref: z.string(), title: z.string(), text: z.string(), score: z.number() })),
  }),
  execute: async ({ query, topK }) => ({
    contract: contractMeta,
    passages: searchContract(query, topK ?? 3),
  }),
});
