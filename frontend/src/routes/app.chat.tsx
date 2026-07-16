import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Send, Bot, User as UserIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { sampleChat } from "@/lib/mock-contracts";

export const Route = createFileRoute("/app/chat")({
  head: () => ({
    meta: [
      { title: "Chat – ContrAIct" },
      { name: "description", content: "Ask anything about your contract. Answers cite the original clauses." },
    ],
  }),
  component: ChatPage,
});

type Msg = { role: "user" | "assistant"; text: string; cites?: string[] };

function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>(sampleChat as Msg[]);
  const [draft, setDraft] = useState("");

  const send = () => {
    if (!draft.trim()) return;
    const next: Msg[] = [...messages, { role: "user", text: draft }];
    setMessages(next);
    setDraft("");
    setTimeout(() => {
      setMessages((cur) => [
        ...cur,
        {
          role: "assistant",
          text:
            "Based on the contract, that clause appears in Section 7. Self-Healing RAG retrieved 3 relevant chunks; the Critic accepted the answer with 0.92 confidence.",
          cites: ["§ 7 Liability Cap", "§ 12 Indemnification"],
        },
      ]);
    }, 700);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl flex-col">
      <div className="mb-4">
        <h1 className="font-display text-3xl font-semibold">Chat with your contract</h1>
        <p className="text-sm text-muted-foreground">Acme Inc. – Employment Offer · grounded in the source document.</p>
      </div>

      <Card className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  m.role === "user"
                    ? "brand-gradient text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {m.role === "user" ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className={`max-w-[80%] space-y-2 ${m.role === "user" ? "items-end text-right" : ""}`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {m.text}
                </div>
                {m.cites && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.cites.map((c) => (
                      <Badge key={c} variant="outline" className="border-primary/30 text-primary">{c}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-3 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about a clause, deadline, or risk…"
        />
        <Button onClick={send} className="brand-gradient text-primary-foreground">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
