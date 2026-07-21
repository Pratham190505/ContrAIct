import { api, unwrap } from "./axios";

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  cites?: string[];
  confidence?: number;
  attempts?: number;
  grounded?: boolean;
};

export async function getChat(contractId: string) {
  const { data } = await api.get(`/api/contracts/${contractId}/chat`);
  return unwrap<ChatMessage[]>(data);
}

export async function sendChatMessage(contractId: string, message: string) {
  const { data } = await api.post(`/api/contracts/${contractId}/chat`, { message });
  return unwrap<ChatMessage>(data);
}

export async function clearChat(contractId: string) {
  const { data } = await api.delete(`/api/contracts/${contractId}/chat`);
  return unwrap<{ cleared: boolean }>(data);
}
