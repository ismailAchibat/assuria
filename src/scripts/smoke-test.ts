// End-to-end smoke test: Ollama connectivity, the 3 agents, and the workflow.
// Run with: npm test

import { claims } from '../data/claims';
import { mastra } from '../mastra';
import { localModel } from '../mastra/models';
import { predictSeverity } from '../mastra/tools/claims';

const checks: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const section = (title: string) => console.log(`\n${'='.repeat(70)}\n${title}\n${'='.repeat(70)}`);

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const r = await fn();
  return [r, (performance.now() - t) / 1000];
}

const toolNames = (res: any): string[] =>
  (res.toolCalls ?? []).map((tc: any) => tc.payload?.toolName ?? tc.toolName).filter(Boolean);

async function main() {
  // ---------------------------------------------------------------- 0. Ollama
  section(`0. Ollama — ${localModel.url} / ${localModel.modelId}`);
  const tags = await fetch(localModel.url.replace(/\/v1\/?$/, '') + '/api/tags').then((r) => r.json());
  const available = tags.models.map((m: any) => m.name);
  check('Ollama reachable and model pulled', available.includes(localModel.modelId), available.join(', '));

  // ------------------------------------------------- 1. Personalization workflow
  section('1. Workflow offer-personalization (extract → rank → recommend)');
  const userMessage =
    "Bonjour, j'ai 22 ans, je viens d'avoir mon permis il y a un an et j'ai acheté une Clio de 2019. " +
    "Je voudrais être bien couvert, surtout contre le vol et le bris de glace, mais je ne peux pas dépasser 70 € par mois.";
  console.log(`User: ${userMessage}\n`);

  const run = await mastra.getWorkflow('offerPersonalizationWorkflow').createRun();
  const [wf, wfTime] = await timed(() => run.start({ inputData: { userMessage } }));
  check('workflow status = success', wf.status === 'success', `${wfTime.toFixed(1)}s`);
  if (wf.status === 'success') {
    const { profile, search, recommendation } = wf.result;
    console.log('\nProfil extrait:', JSON.stringify(profile, null, 2));
    console.log('\nRecherche:', search.status, search.missing.map((m) => m.label).join(', '));
    console.log(`\nRecommandation:\n${recommendation}`);
    check('profile.licenseYears = 1', profile.licenseYears === 1, String(profile.licenseYears));
    check('profile.maxMonthlyBudget = 70', profile.maxMonthlyBudget === 70, String(profile.maxMonthlyBudget));
    // The message lacks e.g. the commune and the parking: the workflow must ask instead of guessing.
    check('incomplete profile -> asks questions', search.status === 'missing_info' && recommendation.includes('?'));
  } else {
    console.log(JSON.stringify(wf, null, 2).slice(0, 2000));
  }

  // ----------------------------------------- 2. Offer advisor, multi-turn + memory
  section('2. Agent offer-advisor — conversation multi-tours (mémoire)');
  const advisor = mastra.getAgent('offerAdvisorAgent');
  const memory = { thread: `smoke-${Date.now()}`, resource: 'demo-user' };

  const searched = (res: any) => toolNames(res).some((n) => n.toLowerCase().includes('searchoffers'));

  const turn1 = 'Bonjour, je cherche une assurance pour ma voiture.';
  console.log(`User: ${turn1}`);
  const [r1, t1] = await timed(() => advisor.generate(turn1, { memory }));
  console.log(`Agent (${t1.toFixed(1)}s): ${r1.text}\n`);
  check('turn 1 asks a question', r1.text.includes('?'));
  check('turn 1 does not search yet', !searched(r1), toolNames(r1).join(','));

  // Driver + vehicle, but usage / commune / budget still missing -> the agent must keep asking.
  const turn2 =
    "J'ai 35 ans, permis français depuis 15 ans, bonus 0,50, aucun sinistre. C'est une Peugeot 308 de 2020.";
  console.log(`User: ${turn2}`);
  const [r2, t2] = await timed(() => advisor.generate(turn2, { memory }));
  console.log(`Agent (${t2.toFixed(1)}s): ${r2.text}\n`);
  check('turn 2 records the profile', toolNames(r2).some((n) => n.toLowerCase().includes('updateprofile')), toolNames(r2).join(','));
  check('turn 2 still asks (usage/commune/budget missing)', !searched(r2) && r2.text.includes('?'));

  const turn3 =
    "Je l'utilise pour aller au travail, 12 000 km par an, garée dans un garage fermé au Mans. " +
    'Je veux surtout le vol et le bris de glace, budget 60 € par mois maximum.';
  console.log(`User: ${turn3}`);
  const [r3, t3] = await timed(() => advisor.generate(turn3, { memory }));
  console.log(`Agent (${t3.toFixed(1)}s): ${r3.text}\n`);
  check('turn 3 calls search-offers', searched(r3), toolNames(r3).join(','));
  check('turn 3 quotes a price in €', /\d+([.,]\d+)?\s?€/.test(r3.text));

  // ------------------------------------------------------ 3. Contract advisor (RAG)
  section('3. Agent contract-advisor — questions sur le contrat (RAG + citations)');
  const contractAdvisor = mastra.getAgent('contractAdvisorAgent');
  const questions = [
    "On m'a volé mon vélo dans l'appartement, la porte n'était pas forcée. Suis-je couvert ? Et j'ai combien de temps pour déclarer ?",
    'Quelle est ma franchise si j’ai un dégât des eaux ?',
  ];
  for (const q of questions) {
    console.log(`User: ${q}`);
    const [r, t] = await timed(() => contractAdvisor.generate(q));
    console.log(`Agent (${t.toFixed(1)}s): ${r.text}\n`);
    check('called search-contract', toolNames(r).length > 0, toolNames(r).join(','));
    check('answer cites contract articles', /\[(CG|CP) Art\. [\d.]+\]/.test(r.text));
  }

  // ------------------------------------------------------- 4. Claims severity
  section('4. Benchmark sévérité — baseline ML + agent claims-analyst');
  // Offline baseline eval (leave-one-out on last 100 claims) — no LLM involved.
  const evalSet = claims.slice(-100);
  const median = [...claims.map((c) => c.loss)].sort((a, b) => a - b)[Math.floor(claims.length / 2)];
  const maeKnn = evalSet.reduce((s, c) => s + Math.abs(predictSeverity(c, c.id).predictedLoss - c.loss), 0) / evalSet.length;
  const maeMedian = evalSet.reduce((s, c) => s + Math.abs(median - c.loss), 0) / evalSet.length;
  console.log(`Dataset: ${claims.length} sinistres synthétiques | MAE k-NN = ${maeKnn.toFixed(0)} | MAE médiane = ${maeMedian.toFixed(0)}`);
  check('k-NN beats median baseline', maeKnn < maeMedian);

  const analyst = mastra.getAgent('claimsAnalystAgent');
  const q = 'Estime le coût du sinistre n°17 et compare avec son coût réel.';
  console.log(`\nUser: ${q}`);
  const [ra, ta] = await timed(() => analyst.generate(q));
  console.log(`Agent (${ta.toFixed(1)}s): ${ra.text}\n`);
  check('called predict-claim-severity', toolNames(ra).some((n) => n.toLowerCase().includes('predict')), toolNames(ra).join(','));
  const truth = predictSeverity(claims[16], 17).predictedLoss;
  check('answer contains the model prediction', ra.text.replace(/[\s  ]/g, '').includes(String(Math.round(truth))) || ra.text.includes(truth.toFixed(2)), `expected ≈ ${truth}`);

  // ---------------------------------------------------------------- summary
  section('Résumé');
  const passed = checks.filter((c) => c.ok).length;
  console.log(`${passed}/${checks.length} checks passed`);
  for (const c of checks.filter((c) => !c.ok)) console.log(`  ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  process.exit(passed === checks.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
