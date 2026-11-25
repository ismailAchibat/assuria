# AssurIA — Mastra + Ollama

Agentic insurance services (Projet INFO 5A 2026-2027).

- **Offer advisor (objectif 1)**: French car insurance, real offers and pricing data from the Neon database (schema `objectif1`, read-only).
- Contract advisor and claims analyst: still on the synthetic data in `src/data/` (`src/data/offers.ts` is the old dummy catalogue, no longer used).

## Prerequisites
- Node ≥ 22, Ollama running with `qwen3:8b` (`ollama pull qwen3:8b`)
- `cp .env.example .env` (already done), with `NEON_PGSQL_CONNECTION_STRING` set

## Commands
| | |
|---|---|
| `npm test` | End-to-end smoke test (agents + workflow + baseline metrics) |
| `npm run validate:pricing` | Recomputes every France/auto row of `offres_prix_profils` with the rebuilt pricing model + runs a sample search (no LLM) |
| `npm run dev` | Mastra Studio at http://localhost:4111 (chat with agents, run workflows, inspect traces) |
| `npm run web` | Chat UI (Next.js + shadcn) at http://localhost:3000 — needs `npm run dev` running |
| `npm run typecheck` | TypeScript check |

## Layout
```
src/
  data/                 dummy data: home contract (CG/CP), Allstate-like claims generator
  mastra/
    db.ts               Neon client (HTTP driver), SELECT only
    profile.ts          car-insurance profile: questions, required fields (some conditional), per-thread store
    offers/
      catalogue.ts      loads objectif1 once: offres_europe + prix_base, fr_* product details, vehicles & communes (profils)
      pricing.ts        pricing model of offres_prix_profils rebuilt for any driver (12 coefficients)
      guarantees.ts     guarantee codes (fr_types_garanties), level split, free-text synonyms
      search.ts         refusal rules, cheapest formula covering the wanted guarantees, scoring, explanations
    models.ts           Ollama model config (OpenAI-compatible endpoint, thinking disabled by default)
    agents/
      profile-extractor   small-LLM structured extraction (free text -> profile JSON)
      offer-advisor       product 1 (car, France): asks targeted questions (update-profile) until the profile is complete, then search-offers
      contract-advisor    product 2: RAG over contract clauses, cites [CG Art. X]
      claims-analyst      product 3: calls the ML severity model and explains it
    tools/              update-profile (fills vehicle/commune from the DB) + search-offers, search-contract (BM25), get-claim / predict-claim-severity (k-NN)
    workflows/
      offer-personalization   extract-profile (LLM) -> rank-offers (DB + code) -> write-recommendation or follow-up questions (LLM)
  scripts/smoke-test.ts
web/                    Next.js 16 + shadcn chat UI for the offer-advisor agent
  next.config.ts        rewrites /api/chat -> Mastra POST /chat/offer-advisor (AI SDK v7 stream)
  src/components/chat.tsx         useChat; sends only the new message + Mastra memory thread id
  src/components/offer-cards.tsx  renders search-offers tool calls as offer cards
```

## Offer advisor: how the database is used
| Table (`objectif1`) | Use |
|---|---|
| `offres_europe` (France, auto) | catalogue: insurer, product, guarantees (`g_*`), deductible, exclusions text |
| `prix_base` | base yearly price per offer and formula (tiers / intermediaire / tous_risques) |
| `offres_prix_profils` | source of the pricing model (coefficients) and of the refusal rules (`statut`); used by `validate:pricing` |
| `fr_produits`, `fr_garanties_produits`, `fr_niveaux_offres`, `fr_conditions_produits` | detail for 7 insurers mapped in `catalogue.ts`: guarantees per formula, caps, exclusions, product sheet link |
| `fr_prix_a_partir_de` | real published "à partir de" price shown next to the estimate |
| `fr_types_garanties` | guarantee codes and labels |
| `fr_stats_marche` | claim frequency / average cost quoted to justify a guarantee |
| `profils` | vehicle catalogue (power, energy, new price) and communes → zone type |

Price = `coefProfil × (base_tiers + (base_formule − base_tiers) × coefDommages)`; it reproduces all 9,360 France rows within 0.005 %.
Not used yet: `fr_vrais_prix` (real prices for reference profiles, for a future price-accuracy benchmark), `profils_dictionnaire`, other countries and moto.
Not priced: BNP Paribas, Suravenir, L'Équité, Pacifica, Matmut 4R Essentiel (in `fr_*` but without base prices).

## Next steps
- **Offer advisor**: moto and other countries (same tables); benchmark estimates against `fr_vrais_prix`; simulated users from `profils` as an eval set.
- **Real RAG**: replace BM25 with embeddings (`ollama pull nomic-embed-text` or `bge-m3`) + `@mastra/rag` chunking + `LibSQLVector`; ingest real CG/CP PDFs.
- **Claims benchmark**: load the real Kaggle Allstate CSV; train GBM baseline (Python/LightGBM) and expose it as a tool or HTTP service; compare with hybrid small-LLM + ML + big-LLM pipelines (MAE, calibration, latency, cost).
- Persist the profile store (currently in-process, reset when the Mastra server restarts).
- **Two-tier models**: add a second model config (bigger local or API model) for the final recommendation step.
- Mastra evals/scorers for faithfulness and citation accuracy.
