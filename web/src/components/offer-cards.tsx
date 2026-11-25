import { isToolError, ToolErrorLine, type ToolError } from "@/components/profile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Ban, ExternalLink, Info, Loader2, Search, ShieldAlert } from "lucide-react";

// Shape returned by the Mastra `search-offers` tool (src/mastra/offers/search.ts).
export interface Offer {
  id: string;
  insurer: string;
  name: string;
  level: string;
  coverageLevel: string;
  monthlyPremium: number;
  annualPremium: number;
  withinBudget: boolean;
  score: number;
  deductible: string;
  guarantees: string[];
  options: string[];
  matchedGuarantees: string[];
  missingGuarantees: string[];
  priceFactors: { label: string; coef: number }[];
  priceSource: string;
  advertisedFrom: { monthly: number; formula: string; profile: string } | null;
  exclusions: string[];
  restrictions: string[];
  sourceUrl: string | null;
  notes: string;
}

export interface SearchOffersOutput {
  status: "ok" | "missing_info";
  summary: { field: string; label: string; value: string | null }[];
  missing: { field: string; label: string; question: string }[];
  offers: Offer[];
  ineligible: { id: string; name: string; reason: string }[];
  refusal: string | null;
  assumptions: string[];
  unrecognizedPriorities: string[];
  marketStats: string[];
}

const CRITERIA_FIELDS = ["vehicle", "city", "priorities", "maxMonthlyBudget"];
const euro = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function OfferSearch({
  state,
  output,
  errorText,
}: {
  state: string;
  output?: SearchOffersOutput | ToolError;
  errorText?: string;
}) {
  if (isToolError(output)) return <ToolErrorLine error={output} />;
  const done = state === "output-available";
  const criteria = output?.summary?.filter((e) => CRITERIA_FIELDS.includes(e.field) && e.value) ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {done ? <Search className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
        <span>{done ? "Recherche dans la base des offres auto" : "Recherche des offres…"}</span>
        {criteria.map((e) => (
          <Badge key={e.field} variant="secondary">
            {e.value}
          </Badge>
        ))}
      </div>

      {state === "output-error" && <p className="text-sm text-destructive">Erreur de l’outil : {errorText}</p>}
      {output?.status === "missing_info" && (
        <p className="text-sm text-muted-foreground">
          Recherche refusée, profil incomplet : {output.missing.map((m) => m.label.toLowerCase()).join(", ")}.
        </p>
      )}
      {output?.refusal && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          {output.refusal}
        </p>
      )}

      {output && output.offers?.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {output.offers.map((o, i) => (
            <OfferCard key={o.id} offer={o} best={i === 0} />
          ))}
        </div>
      )}
      {output?.status === "ok" && !output.refusal && !output.offers?.length && (
        <p className="text-sm text-muted-foreground">Aucune offre éligible trouvée.</p>
      )}
      {output && output.assumptions?.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {output.assumptions.map((a) => (
            <span key={a}>
              <Info className="mr-1 inline size-3" />
              {a}
            </span>
          ))}
        </div>
      )}
      {output && output.ineligible?.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="font-medium">Non éligibles :</span>
          {output.ineligible.map((o) => (
            <span key={o.id}>
              <Ban className="mr-1 inline size-3" />
              {o.name} — {o.reason}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer, best }: { offer: Offer; best: boolean }) {
  return (
    <Card size="sm" className={best ? "ring-2 ring-primary" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>{offer.insurer}</CardTitle>
            <CardDescription className="break-words">{offer.name}</CardDescription>
          </div>
          <Badge variant={best ? "default" : "secondary"}>{Math.round(offer.score * 100)}%</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col">
          <span className="text-2xl font-semibold tabular-nums">
            {euro(offer.monthlyPremium)} €<span className="text-sm font-normal text-muted-foreground">/mois</span>
          </span>
          <span className="text-xs text-muted-foreground">
            estimation · {offer.annualPremium.toLocaleString("fr-FR")} €/an · {offer.deductible}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{offer.coverageLevel}</Badge>
          {offer.withinBudget ? (
            <Badge variant="secondary">dans le budget</Badge>
          ) : (
            <Badge variant="destructive">hors budget</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {offer.matchedGuarantees.map((g) => (
            <Badge key={g} variant="ghost" className="bg-muted">
              {g}
            </Badge>
          ))}
          {offer.missingGuarantees.map((g) => (
            <Badge key={g} variant="destructive">
              manque : {g}
            </Badge>
          ))}
        </div>
        {offer.priceFactors.length > 0 && (
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="font-medium text-muted-foreground">Ce qui fait le prix</span>
            {offer.priceFactors.slice(0, 3).map((f) => (
              <span key={f.label} className="flex justify-between gap-2">
                <span className="truncate">{f.label}</span>
                <span className={f.coef > 1 ? "tabular-nums text-destructive" : "tabular-nums text-primary"}>×{f.coef}</span>
              </span>
            ))}
          </div>
        )}
        {offer.exclusions.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Exclusions principales</summary>
            <ul className="mt-1 list-disc pl-4">
              {offer.exclusions.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {offer.advertisedFrom && (
            <span>
              Prix public « à partir de » : {euro(offer.advertisedFrom.monthly)} €/mois ({offer.advertisedFrom.formula},{" "}
              {offer.advertisedFrom.profile})
            </span>
          )}
          <span>{offer.priceSource}</span>
          {offer.sourceUrl && (
            <a href={offer.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
              Fiche produit <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
