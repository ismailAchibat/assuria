import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Circle, Database, Loader2, UserRound } from "lucide-react";

// Shapes returned by the Mastra `update-profile` tool.
export interface ProfileEntry {
  field: string;
  label: string;
  value: string | null;
}

export interface ProfileUpdateOutput {
  summary: ProfileEntry[];
  rejected: { field: string; reason: string }[];
  missing: { field: string; label: string; question: string }[];
  notes?: string[];
  readyToSearch: boolean;
}

// When Mastra rejects a tool call (input validation) the "output" is an error object, not the tool's result.
export interface ToolError {
  error: true;
  message: string;
}
export const isToolError = (o: unknown): o is ToolError =>
  !!o && typeof o === "object" && (o as { error?: unknown }).error === true;

export function ToolErrorLine({ error }: { error: ToolError }) {
  const first = error.message.split("\n").find((l) => l.trim().startsWith("-")) ?? error.message.split("\n")[0];
  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
      <AlertTriangle className="size-3.5" />
      Appel d’outil refusé : {first.replace(/^\s*-\s*/, "")}
    </div>
  );
}

// Inline line in the conversation: what the agent just recorded.
export function ProfileUpdate({
  state,
  input,
  output,
}: {
  state: string;
  input?: Record<string, unknown>;
  output?: ProfileUpdateOutput | ToolError;
}) {
  if (isToolError(output)) return <ToolErrorLine error={output} />;
  if (state !== "output-available" || !output) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Mise à jour du profil…
      </div>
    );
  }
  const rejected = new Set((output.rejected ?? []).map((r) => r.field));
  const recorded = (output.summary ?? []).filter((e) => input && e.field in input && !rejected.has(e.field) && e.value);
  return (
    <div className="flex flex-col gap-1.5">
      {recorded.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <UserRound className="size-3.5" />
          <span>Profil mis à jour</span>
          {recorded.map((e) => (
            <Badge key={e.field} variant="secondary">
              {e.label} : {e.value}
            </Badge>
          ))}
        </div>
      )}
      {output.notes?.map((n) => (
        <div key={n} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Database className="size-3.5" />
          {n}
        </div>
      ))}
      {(output.rejected ?? []).map((r) => (
        <div key={r.field} className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3.5" />
          Valeur non retenue ({r.field}) : non mentionnée par l’utilisateur
        </div>
      ))}
    </div>
  );
}

// Sidebar checklist of what the agent knows / still needs.
export function ProfilePanel({ profile }: { profile?: ProfileUpdateOutput }) {
  const entries = profile?.summary ?? [
    { field: "age", label: "Âge", value: null },
    { field: "licenseYears", label: "Ancienneté du permis", value: null },
    { field: "vehicle", label: "Véhicule", value: null },
  ];
  const filled = entries.filter((e) => e.value !== null).length;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Profil</CardTitle>
        <CardDescription>
          {profile?.readyToSearch ? "Complet — recherche possible" : `${filled}/${entries.length} informations`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(filled / entries.length) * 100}%` }}
          />
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          {entries.map((e) => (
            <li key={e.field} className="flex items-start gap-2">
              {e.value !== null ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
              )}
              <div className="min-w-0">
                <div className={e.value !== null ? "text-xs text-muted-foreground" : "text-muted-foreground"}>
                  {e.label}
                </div>
                {e.value !== null && <div className="break-words">{e.value}</div>}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
