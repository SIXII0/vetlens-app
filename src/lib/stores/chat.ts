import { writable } from 'svelte/store';

export interface ChatContext {
  analysisId?: string;
  recordId?: string;
  petId?: string;
}

export const chatOpen = writable(false);
export const chatContext = writable<ChatContext | null>(null);

export function setChatContext(ctx: ChatContext) {
  chatContext.set(ctx);
}

export function openChat(ctx: ChatContext) {
  chatContext.set(ctx);
  chatOpen.set(true);
}

export function closeChat() {
  chatOpen.set(false);
}

export function toggleChat() {
  chatOpen.update(v => !v);
}
