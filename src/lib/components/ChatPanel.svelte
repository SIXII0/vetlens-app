<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { chatOpen, chatContext, closeChat } from '$lib/stores/chat';
  import { renderSafeMarkdown } from '$lib/utils/safe-markdown';
  import { AlertTriangle, ArrowRight, Bot, FileText, Maximize2, MessageCircle, Minimize2, Send, Shield, X } from '@lucide/svelte';

  interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    intent?: string;
    llmUsed?: boolean;
    safety?: { triggered: boolean; type?: string; message?: string };
    sources?: Array<{ title: string; type: string; snippet?: string }>;
    actions?: Array<{ type: string; label: string; href?: string }>;
  }

  let messages = $state<ChatMessage[]>([]);
  let input = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let sessionId = $state<string | null>(null);
  let chatRef = $state<HTMLDivElement | null>(null);
  let inputRef = $state<HTMLTextAreaElement | null>(null);
  let llmConfigured = $state(true);
  let panelMode = $state<'default' | 'expanded'>('default');
  let isComposing = $state(false);
  let ctx = $derived($chatContext);
  let open = $derived($chatOpen);

  onMount(() => {
    const savedMode = localStorage.getItem('vetlens-chat-panel-mode');
    if (savedMode === 'default' || savedMode === 'expanded') panelMode = savedMode;
    resizeTextarea();
  });

  $effect(() => {
    if (open) {
      messages = [];
      sessionId = null;
      error = null;
      if (ctx?.analysisId) loadHistory(ctx.analysisId);
      checkLlmStatus();
    }
  });

  async function checkLlmStatus() {
    try {
      const res = await fetch('/api/settings/llm');
      if (res.ok) llmConfigured = (await res.json()).provider !== 'none';
    } catch { /* status is informational */ }
  }

  async function loadHistory(analysisId: string) {
    const saved = localStorage.getItem(`chat_session_${analysisId}`);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      sessionId = parsed.sessionId;
      const res = await fetch(`/api/chat/history?sessionId=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages?.length) messages = data.messages;
      }
    } catch { /* ignore a stale history entry */ }
  }

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading || isComposing) return;
    error = null;
    loading = true;
    input = '';
    await tick();
    resizeTextarea();

    const userMsg: ChatMessage = { id: `temp-${Date.now()}`, role: 'user', content: msg };
    messages = [...messages, userMsg];
    tick().then(scrollToBottom);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          sessionId: sessionId || undefined,
          analysisId: ctx?.analysisId || undefined,
          recordId: ctx?.recordId || undefined,
          petId: ctx?.petId || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '请求失败');
      }
      const data = await res.json();
      sessionId = data.sessionId || sessionId;
      if (data.sessionId && ctx?.analysisId) {
        localStorage.setItem(`chat_session_${ctx.analysisId}`, JSON.stringify({ sessionId: data.sessionId }));
      }
      messages = [...messages, {
        id: data.messageId,
        role: 'assistant',
        content: data.reply,
        intent: data.intent,
        llmUsed: data.llmUsed === true,
        safety: data.safety,
        sources: data.sources,
        actions: data.actions,
      }];
    } catch {
      input = msg;
      error = '发送失败，请稍后重试。';
      messages = messages.filter((message) => message.id !== userMsg.id);
    } finally {
      loading = false;
      tick().then(scrollToBottom);
    }
  }

  function scrollToBottom() {
    if (chatRef) chatRef.scrollTop = chatRef.scrollHeight;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing || isComposing) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!input.trim() || loading) return;
    event.preventDefault();
    sendMessage();
  }

  function resizeTextarea() {
    if (!inputRef) return;
    inputRef.style.height = 'auto';
    inputRef.style.height = `${Math.min(Math.max(inputRef.scrollHeight, 44), 160)}px`;
  }

  function togglePanelMode() {
    panelMode = panelMode === 'default' ? 'expanded' : 'default';
    localStorage.setItem('vetlens-chat-panel-mode', panelMode);
  }
</script>

{#if open}
  <div class="md:hidden fixed inset-0 bg-black/30 z-35 animate-fade-in" onclick={closeChat} aria-hidden="true"></div>
  <div class="chat-panel" class:chat-panel-expanded={panelMode === 'expanded'} role="complementary" aria-label="宠物健康与账单助手对话面板">
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-warm-100 bg-warm-50/50">
      <div class="flex items-center gap-1.5"><Bot size={16} class="text-brand-500" /><span class="text-sm font-semibold text-warm-900">宠物健康与账单助手</span></div>
      <div class="flex items-center gap-1">
        <button class="panel-mode-button btn-ghost text-sm px-1.5 py-1" onclick={togglePanelMode} aria-label={panelMode === 'expanded' ? '恢复默认宽度' : '展开助手'} title={panelMode === 'expanded' ? '恢复默认宽度' : '展开助手'}>
          {#if panelMode === 'expanded'}<Minimize2 size={14} />{:else}<Maximize2 size={14} />{/if}
        </button>
        <button class="btn-ghost text-sm px-1.5 py-1" onclick={closeChat} aria-label="关闭助手面板"><X size={14} /></button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-3 py-2 space-y-2.5" bind:this={chatRef} role="log" aria-live="polite" aria-label="对话消息">
      {#if !llmConfigured}<div class="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs"><div class="flex items-center gap-1.5 mb-1"><AlertTriangle size={14} class="text-amber-600" /><p class="font-medium text-amber-800">AI 模型未配置</p></div><p class="text-amber-700">请前往设置页面配置模型。</p></div>{/if}
      {#if messages.length === 0 && !loading}
        <div class="text-center py-6"><div class="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-3"><MessageCircle size={24} class="text-brand-400" /></div><p class="text-xs text-warm-600 mb-3">我可以帮你理解宠物健康、检查项目、账单和保险材料。</p></div>
      {:else}
        {#each messages as msg (msg.id)}
          <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-enter"><div class="max-w-[92%] rounded-xl px-2.5 py-2 text-xs" class:bg-brand-500={msg.role === 'user'} class:text-white={msg.role === 'user'} class:bg-warm-50={msg.role === 'assistant'} class:text-warm-900={msg.role === 'assistant'} class:border={msg.role === 'assistant'} class:border-warm-100={msg.role === 'assistant'}>
            {#if msg.safety?.triggered}<div class="flex items-center gap-1 mb-1 text-red-600 text-2xs font-semibold"><AlertTriangle size={12} />安全提醒</div>{/if}
            {#if msg.role === 'assistant'}<div class="chat-markdown leading-relaxed">{@html renderSafeMarkdown(msg.content)}</div>{:else}<div class="leading-relaxed whitespace-pre-wrap break-words">{msg.content}</div>{/if}
            {#if msg.role === 'assistant' && msg.llmUsed === false && !msg.safety?.triggered}<span class="text-2xs text-warm-500 bg-warm-100 px-1 py-0.5 rounded">模板回复</span>{/if}
            {#if msg.sources?.length}<div class="mt-1.5 pt-1.5 border-t border-warm-200/50 text-2xs text-warm-600">参考信息：{#each msg.sources.slice(0, 3) as source}<div>· {source.title}</div>{/each}</div>{/if}
            {#if msg.actions?.length}<div class="mt-1.5 pt-1.5 border-t border-warm-200/50 flex flex-wrap gap-1">{#each msg.actions as action}<a href={action.href || '#'} class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-warm-200 text-2xs text-warm-600 no-underline"><ArrowRight size={10} />{action.label}</a>{/each}</div>{/if}
          </div></div>
        {/each}
      {/if}
      {#if loading}<div class="flex justify-start"><div class="rounded-xl px-3 py-2 bg-warm-50 border border-warm-100 animate-pulse">正在思考…</div></div>{/if}
      {#if error}<div class="text-2xs text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-200 flex items-center gap-1"><AlertTriangle size={12} />{error}<button class="ml-1 underline" onclick={() => error = null}>关闭</button></div>{/if}
    </div>

    <div class="shrink-0 px-3 py-2 border-t border-warm-100 bg-white">
      <div class="flex min-w-0 gap-1.5">
        <textarea bind:this={inputRef} class="input-field message-input min-w-0 flex-1 text-xs py-1.5" placeholder="输入问题..." bind:value={input} onkeydown={handleKeydown} oninput={resizeTextarea} oncompositionstart={() => isComposing = true} oncompositionend={() => isComposing = false} disabled={loading} aria-label="输入问题" rows="1"></textarea>
        <button class="btn-primary send-button flex-none min-w-[68px] whitespace-nowrap text-xs px-3 py-1.5 rounded-lg" onclick={() => sendMessage()} disabled={loading || !input.trim()}>{#if loading}<span class="animate-pulse">发送中</span>{:else}<Send size={13} /> 发送{/if}</button>
      </div>
      <p class="chat-input-hint text-2xs text-warm-500 mt-1 text-center">Enter 发送 · Ctrl/Shift+Enter 换行</p>
      <p class="text-2xs text-warm-500 mt-1 text-center">回答不能替代兽医诊疗。</p>
    </div>
  </div>
{/if}

<style>
  .chat-panel { width: clamp(380px, 30vw, 460px); max-width: 100%; flex: 0 1 clamp(380px, 30vw, 460px); border-left: 1px solid rgb(231 229 228); background: white; display: flex; flex-direction: column; height: 100%; }
  .chat-panel-expanded { width: clamp(560px, 48vw, 760px); flex-basis: clamp(560px, 48vw, 760px); }
  .message-input { min-height: 44px; max-height: 160px; height: 44px; resize: none; overflow-y: auto; overflow-x: hidden; line-height: 1.5; }
  .chat-markdown :global(p) { margin: 0 0 0.5rem; }
  .chat-markdown :global(p:last-child) { margin-bottom: 0; }
  .chat-markdown :global(ul), .chat-markdown :global(ol) { margin: 0.35rem 0 0.5rem 1.1rem; }
  .chat-markdown :global(ul) { list-style: disc; }
  .chat-markdown :global(ol) { list-style: decimal; }
  .chat-markdown :global(code) { padding: 0.05rem 0.25rem; border-radius: 0.25rem; background: rgb(0 0 0 / 0.06); font-size: 0.9em; }
  .chat-markdown :global(a) { color: #0f766e; text-decoration: underline; overflow-wrap: anywhere; }
  .chat-markdown :global(.chat-heading) { margin: 0.9rem 0 0.5rem; font-size: 1rem; line-height: 1.5; font-weight: 650; }
  .chat-markdown :global(.chat-heading:first-child) { margin-top: 0; }
  .chat-markdown :global(.chat-divider) { margin: 0.9rem 0; border: 0; border-top: 1px solid rgb(231 229 228); }
  @media (max-width: 767px) {
    .chat-panel, .chat-panel-expanded { position: fixed; inset-block: 0; right: 0; z-index: 40; width: 100vw; max-width: 100vw; flex-basis: 100vw; box-shadow: 0 12px 40px rgb(0 0 0 / 0.18); }
    .panel-mode-button { display: none; }
    .chat-input-hint { font-size: 0; }
    .chat-input-hint::after { content: 'Enter 发送 · 组合键换行'; font-size: 0.625rem; }
  }
</style>
