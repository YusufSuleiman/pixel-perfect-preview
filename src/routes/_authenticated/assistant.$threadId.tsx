import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Bot, MessageSquarePlus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assistant/$threadId")({
  head: () => ({ meta: [
    { title: "Portfolio Assistant — EGX Ledger" },
    { name: "description", content: "Ask questions about your EGX holdings, cash, and transactions." },
    { property: "og:title", content: "Portfolio Assistant — EGX Ledger" },
    { property: "og:description", content: "Account-based AI conversations grounded in your investment ledger." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: AssistantPage,
});

type ConversationRow = { id: string; title: string; updated_at: string };

function AssistantPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const threads = useQuery({ queryKey: ["ai-conversations"], queryFn: async () => {
    const { data, error } = await supabase.from("ai_conversations").select("id,title,updated_at").order("updated_at", { ascending: false });
    if (error) throw error;
    return data as ConversationRow[];
  }});
  const history = useQuery({ queryKey: ["ai-messages", threadId], queryFn: async () => {
    const { data, error } = await supabase.from("ai_messages").select("sdk_message_id,role,parts").eq("conversation_id", threadId).order("created_at");
    if (error) throw error;
    return (data ?? []).map((row) => ({ id: row.sdk_message_id ?? crypto.randomUUID(), role: row.role as "user" | "assistant", parts: row.parts as UIMessage["parts"] }));
  }});

  async function createThread() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data, error } = await supabase.from("ai_conversations").insert({ user_id: auth.user.id }).select("id").single();
    if (error || !data) return toast.error(error?.message ?? "Could not create a conversation");
    await qc.invalidateQueries({ queryKey: ["ai-conversations"] });
    navigate({ to: "/assistant/$threadId", params: { threadId: data.id } });
  }

  async function deleteThread(id: string) {
    const { error } = await supabase.from("ai_conversations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    const remaining = (threads.data ?? []).filter((thread) => thread.id !== id);
    await qc.invalidateQueries({ queryKey: ["ai-conversations"] });
    if (id === threadId) {
      if (remaining[0]) navigate({ to: "/assistant/$threadId", params: { threadId: remaining[0].id } });
      else navigate({ to: "/assistant" });
    }
  }

  if (history.isLoading) return <div className="text-muted-foreground py-20 text-center text-sm">Loading conversation…</div>;
  if (history.isError) return <div className="text-destructive py-20 text-center text-sm">This conversation could not be loaded.</div>;

  return (
    <div className="grid h-[calc(100vh-7rem)] min-h-[620px] gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="border-border flex min-h-0 flex-col border-r pr-4 max-lg:hidden">
        <Button className="mb-4 w-full" onClick={createThread}><MessageSquarePlus className="h-4 w-4" /> New conversation</Button>
        <div className="space-y-1 overflow-y-auto">
          {(threads.data ?? []).map((thread) => (
            <div key={thread.id} className={cn("group flex items-center rounded-md", thread.id === threadId && "bg-accent")}>
              <Link to="/assistant/$threadId" params={{ threadId: thread.id }} className="min-w-0 flex-1 truncate px-3 py-2 text-sm">{thread.title}</Link>
              <Button variant="ghost" size="icon" className="mr-1 h-7 w-7 opacity-0 group-hover:opacity-100" aria-label={`Delete ${thread.title}`} onClick={() => deleteThread(thread.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      </aside>
      <ChatWindow key={threadId} threadId={threadId} initialMessages={history.data ?? []} refreshThreads={() => qc.invalidateQueries({ queryKey: ["ai-conversations"] })} createThread={createThread} />
    </div>
  );
}

function ChatWindow({ threadId, initialMessages, refreshThreads, createThread }: { threadId: string; initialMessages: UIMessage[]; refreshThreads: () => Promise<unknown>; createThread: () => Promise<void> }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    headers: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
    },
    body: { conversationId: threadId },
  }), [threadId]);
  const { messages, sendMessage, status, stop, error } = useChat({ id: threadId, messages: initialMessages, transport, onFinish: () => { void refreshThreads(); } });

  useEffect(() => { textarea.current?.focus(); }, [threadId, status]);
  const busy = status === "submitted" || status === "streaming";

  return (
    <section className="panel flex min-h-0 flex-col overflow-hidden">
      <header className="border-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3"><span className="bg-primary text-primary-foreground grid h-9 w-9 place-items-center rounded-md"><Bot className="h-5 w-5" /></span><div><h1 className="font-semibold">Portfolio analyst</h1><p className="text-muted-foreground text-xs">Grounded in your ledger · prices may be manual</p></div></div>
        <Button variant="outline" size="sm" className="lg:hidden" onClick={createThread}><MessageSquarePlus className="h-4 w-4" /> New</Button>
      </header>
      <Conversation className="min-h-0">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 && <ConversationEmptyState icon={<Bot className="h-8 w-8" />} title="Ask about your portfolio" description="Try: Which positions contribute most to my unrealized result?" />}
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.parts.map((part, index) => part.type === "text" ? <MessageResponse key={`${message.id}-${index}`}>{part.text}</MessageResponse> : null)}
              </MessageContent>
            </Message>
          ))}
          {status === "submitted" && <Message from="assistant"><MessageContent><Shimmer>Reviewing your ledger…</Shimmer></MessageContent></Message>}
          {error && <p className="text-destructive text-sm">{error.message}</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-border border-t p-3">
        <PromptInput className="mx-auto max-w-3xl" onSubmit={async ({ text }) => { const question = text.trim(); if (!question || busy) return; await sendMessage({ text: question }); }}>
          <PromptInputBody><PromptInputTextarea ref={textarea} placeholder="Ask about holdings, performance, cash, or a transaction…" /></PromptInputBody>
          <PromptInputFooter><span className="text-muted-foreground px-1 text-xs">Uses your complete saved ledger</span><PromptInputSubmit status={status} onStop={stop} disabled={!busy && false} /></PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  );
}