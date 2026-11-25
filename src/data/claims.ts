// Synthetic claims dataset mimicking the Allstate Claims Severity schema
// (catN categorical + contN continuous features in [0,1], target `loss`).
// Reduced to 6 categorical + 5 continuous features. Deterministic (seeded).

export interface Claim {
  id: number;
  cat: Record<string, string>; // cat1..cat6
  cont: Record<string, number>; // cont1..cont5
  loss: number;
}

export const CAT_FEATURES = ['cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6'] as const;
export const CONT_FEATURES = ['cont1', 'cont2', 'cont3', 'cont4', 'cont5'] as const;

const CAT_LEVELS: Record<string, string[]> = {
  cat1: ['A', 'B'],
  cat2: ['A', 'B'],
  cat3: ['A', 'B', 'C'],
  cat4: ['A', 'B', 'C', 'D'],
  cat5: ['A', 'B', 'C', 'D', 'E'],
  cat6: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
};

// mulberry32 PRNG
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export function generateClaims(n = 600, seed = 42): Claim[] {
  const rand = rng(seed);
  const claims: Claim[] = [];
  for (let i = 0; i < n; i++) {
    const cat: Record<string, string> = {};
    for (const f of CAT_FEATURES) {
      const levels = CAT_LEVELS[f];
      cat[f] = levels[Math.floor(rand() * levels.length)];
    }
    const cont: Record<string, number> = {};
    for (const f of CONT_FEATURES) cont[f] = +rand().toFixed(4);

    // Hidden generative process on log(loss), right-skewed like Allstate.
    let logLoss = 7.4;
    if (cat.cat1 === 'B') logLoss += 0.45;
    if (cat.cat3 === 'C') logLoss += 0.3;
    logLoss += ['A', 'B', 'C', 'D'].indexOf(cat.cat4) * 0.12;
    logLoss += 0.9 * cont.cont2 - 0.4 * cont.cont4 + 0.5 * cont.cont1 * cont.cont3;
    logLoss += 0.35 * gaussian(rand);

    claims.push({ id: i + 1, cat, cont, loss: +Math.exp(logLoss).toFixed(2) });
  }
  return claims;
}

export const claims = generateClaims();
