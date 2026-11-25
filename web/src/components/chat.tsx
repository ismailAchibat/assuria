"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Bot, Loader2, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { OfferSearch, type SearchOffersOutput } from "@/components/offer-cards";
import { isToolError, ProfilePanel, ProfileUpdate, type ProfileUpdateOutput } from "@/components/profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SUGGESTIONS = [
  "Bonjour, je cherche une assurance auto.",
  "J'ai 22 ans, permis depuis 1 an, une Clio de 2019 pour aller au travail. Je veux être couvert contre le vol et le bris de glace, 70 € max par mois.",
  "Je viens d'acheter une Tesla Model 3 neuve, je veux une assurance tous risques à Lyon.",
  "J'ai 45 ans, bonus 0,50, une Peugeot 308 de 2020 garée dans la rue à Bordeaux. Que me conseillez-vous ?",
];

type ToolPart = { type: string; state: string; input?: Record<string, unknown>; output?: unknown; errorText?: string };

// Latest profile snapshot returned by update-profile (or search-offers) in the conversation.
function latestProfile(messages: UIMessage[]): ProfileUpdateOutput | undefined {
  for (const m of [...messages].reverse()) {
    for (const p of [...m.parts].reverse() as ToolPart[]) {
      // Skip rejected tool calls (error objects): keep looking for the last real profile.
      if (p.state !== "output-available" || isToolError(p.output)) continue;
      if (p.type === "tool-updateProfileTool") return p.output as ProfileUpdateOutput;
      if (p.type === "tool-searchOffersTool") {
        const o = p.output as SearchOffersOutput;
        return { summary: o.summary, missing: o.missing, rejected: [], readyToSearch: o.status === "ok" };
      }
    }
  }
}

// Mastra keeps the conversation in memory (thread), so only the new message is sent.
const transport = new DefaultChatTransport<UIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages, body }) => ({
    body: { messages: messages.slice(-1), memory: { thread: body?.threadId, resource: "web-user" } },
  }),
});

export function Chat() {
  const { messages, setMessages, sendMessage, status, stop, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const threadRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const profile = latestProfile(messages);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    // Created on first send, not during render (Next prerenders this component).
    threadRef.current ??= crypto.randomUUID();
    sendMessage({ text }, { body: { threadId: threadRef.current } });
    setInput("");
  };

  const reset = () => {
    threadRef.current = null;
    setMessages([]);
  };

  return (
    <div className="mx-auto flex h-dvh w-full max-w-6xl flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="size-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">AssurIA — Conseiller assurance auto</h1>
            <p className="text-xs text-muted-foreground">Agent offer-advisor · Mastra</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">qwen3:8b · local</Badge>
          <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
            <RotateCcw data-icon="inline-start" />
            Nouvelle conversation
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 overflow-y-auto px-4 py-6">
            {messages.length === 0 ? (
              <EmptyState onPick={submit} />
            ) : (
              <div className="flex flex-col gap-6">
                {messages.map((m) => (
                  <Message key={m.id} message={m} />
                ))}
                {status === "submitted" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> L’agent réfléchit…
                  </div>
                )}
                {error && <p className="text-sm text-destructive">Erreur : {error.message}</p>}
              </div>
            )}
            <div ref={bottomRef} />
          </main>

          <footer className="border-t p-4">
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
              }}
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
                placeholder="Décrivez votre situation et vos besoins…"
                className="min-h-20 resize-none pr-12"
              />
              {busy ? (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-2 bottom-2"
                  onClick={stop}
                >
                  <Square />
                </Button>
              ) : (
                <Button type="submit" size="icon" className="absolute right-2 bottom-2" disabled={!input.trim()}>
                  <ArrowUp />
                </Button>
              )}
            </form>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Assurance auto France · offres réelles, tarifs estimés pour votre profil — prototype de recherche, ne constitue pas un devis.
            </p>
          </footer>
        </div>
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l p-4 lg:block">
          <ProfilePanel profile={profile} />
        </aside>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Trouvons l’assurance auto qui vous correspond</h2>
        <p className="text-sm text-muted-foreground">
          L’agent vous pose quelques questions sur vous et votre véhicule, puis compare les offres d’assurance auto.
        </p>
      </div>
      <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Message({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border">
        <Bot className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div key={i} className="prose-chat text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
              </div>
            );
          }
          const tool = part as ToolPart;
          if (tool.type === "tool-updateProfileTool") {
            return (
              <ProfileUpdate
                key={i}
                state={tool.state}
                input={tool.input}
                output={tool.output as Parameters<typeof ProfileUpdate>[0]["output"]}
              />
            );
          }
          if (tool.type === "tool-searchOffersTool") {
            return (
              <OfferSearch
                key={i}
                state={tool.state}
                output={tool.output as Parameters<typeof OfferSearch>[0]["output"]}
                errorText={tool.errorText}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
