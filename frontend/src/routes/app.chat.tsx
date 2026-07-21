import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Send, Bot, User as UserIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { contractSelectionSearchSchema } from "@/lib/contract-selection";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { clearChat, getChat, sendChatMessage, type ChatMessage } from "@/api/chat";
import { getContracts } from "@/api/contracts";

export const Route = createFileRoute("/app/chat")({
  validateSearch: contractSelectionSearchSchema,
  head: () => ({
    meta: [
      { title: "Chat - ContrAIct" },
      { name: "description", content: "Ask anything about your contract. Answers cite the original clauses." },
    ],
  }),
  component: ChatPage,
});

type Msg = ChatMessage;

function ChatPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<Msg[]>([]);
  const { contractId: selectedContractId } = Route.useSearch();
  const { data: contracts = [], isError: contractsError, error: contractsErrorValue } = useQuery({
    queryKey: ["contracts"],
    queryFn: getContracts,
  });
  const contract = contracts.find((c) => c.id === selectedContractId) ?? contracts[0];
  const { data: messages = [], isError, error } = useQuery({
    queryKey: ["contracts", contract?.id, "chat"],
    queryFn: () => getChat(contract!.id),
    enabled: Boolean(contract?.id),
  });

  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (contractsError || isError) {
      const message = contractsErrorValue instanceof Error ? contractsErrorValue.message : error instanceof Error ? error.message : "Failed to load chat";
      toast.error(message);
    }
  }, [contractsError, contractsErrorValue, error, isError]);

  const sendMutation = useMutation({
    mutationFn: (message: string) => sendChatMessage(contract!.id, message),
    onSuccess: (reply) => {
      setLocalMessages((cur) => [...cur, reply]);
      void queryClient.invalidateQueries({ queryKey: ["contracts", contract?.id, "chat"] });
    },
    onError: (sendError) => {
      toast.error(sendError instanceof Error ? sendError.message : "Failed to send message");
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearChat(contract!.id),
    onSuccess: () => {
      setLocalMessages([]);
      void queryClient.invalidateQueries({ queryKey: ["contracts", contract?.id, "chat"] });
    },
    onError: (clearError) => {
      toast.error(clearError instanceof Error ? clearError.message : "Failed to clear conversation");
    },
  });

  const send = () => {
    if (!draft.trim() || !contract) return;
    const userMessage: Msg = { role: "user", text: draft };
    setLocalMessages((cur) => [...cur, userMessage]);
    sendMutation.mutate(draft);
    setDraft("");
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Chat with your contract</h1>
          <p className="text-sm text-muted-foreground">{contract ? `${contract.name} - grounded in the source document.` : "Grounded in the source document."}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => clearMutation.mutate()} disabled={!contract || clearMutation.isPending}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Card className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {localMessages.map((m, i) => (
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
          placeholder="Ask about a clause, deadline, or risk..."
        />
        <Button onClick={send} className="brand-gradient text-primary-foreground" disabled={!contract || sendMutation.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
