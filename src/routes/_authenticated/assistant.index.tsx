import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/assistant/")({
  head: () => ({ meta: [
    { title: "Portfolio Assistant — EGX Ledger" },
    { name: "description", content: "Ask grounded questions about your EGX holdings and transaction history." },
    { property: "og:title", content: "Portfolio Assistant — EGX Ledger" },
    { property: "og:description", content: "AI explanations grounded in your portfolio ledger." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: AssistantIndex,
});

function AssistantIndex() {
  const navigate = useNavigate();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: latest } = await supabase.from("ai_conversations").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      let id = latest?.id;
      if (!id) {
        const { data } = await supabase.from("ai_conversations").insert({ user_id: auth.user.id }).select("id").single();
        id = data?.id;
      }
      if (id) navigate({ to: "/assistant/$threadId", params: { threadId: id }, replace: true });
    })();
  }, [navigate]);
  return <div className="text-muted-foreground flex min-h-[60vh] items-center justify-center gap-2 text-sm"><Bot className="h-5 w-5" /> Opening your assistant…</div>;
}