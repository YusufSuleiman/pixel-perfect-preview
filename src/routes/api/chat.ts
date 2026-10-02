import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { computeAccounting } from "@/lib/accounting";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai-gateway.server";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(z.object({ id: z.string(), role: z.enum(["user", "assistant"]), parts: z.array(z.any()) })),
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return Response.json({ message: "Please sign in again." }, { status: 401 });
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const lovableKey = process.env["LOVABLE_API_KEY"];
        if (!url || !key || !lovableKey) return Response.json({ message: "AI is not configured." }, { status: 401 });

        const token = auth.slice(7);
        const supabase = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: authError } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (authError || !userId) return Response.json({ message: "Please sign in again." }, { status: 401 });

        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) return Response.json({ message: "Invalid chat request." }, { status: 400 });
        const { conversationId } = parsed.data;
        const messages = parsed.data.messages as UIMessage[];
        const { data: conversation } = await supabase
          .from("ai_conversations")
          .select("id, title")
          .eq("id", conversationId)
          .eq("user_id", userId)
          .maybeSingle();
        if (!conversation) return Response.json({ message: "Conversation not found." }, { status: 404 });

        const lastUser = [...messages].reverse().find((message) => message.role === "user");
        if (!lastUser) return Response.json({ message: "Write a question first." }, { status: 400 });
        const { error: saveUserError } = await supabase.from("ai_messages").upsert(
          {
            conversation_id: conversationId,
            user_id: userId,
            sdk_message_id: lastUser.id,
            role: "user",
            parts: lastUser.parts as Json,
          },
          { onConflict: "user_id,conversation_id,sdk_message_id", ignoreDuplicates: true },
        );
        if (saveUserError) return Response.json({ message: "Could not save your question." }, { status: 500 });

        const [tx, cash, prices, settings] = await Promise.all([
          supabase.from("transactions").select("*").order("trade_date").order("created_at"),
          supabase.from("cash_movements").select("*").order("move_date").order("created_at"),
          supabase.from("market_prices").select("*"),
          supabase.from("settings").select("*").maybeSingle(),
        ]);
        const dataError = tx.error || cash.error || prices.error || settings.error;
        if (dataError) return Response.json({ message: "Could not read your portfolio." }, { status: 500 });
        const n = (value: unknown) => Number(value ?? 0);
        const transactions = (tx.data ?? []).map((row) => ({
          ...row,
          type: row.type as "BUY" | "SELL",
          shares: n(row.shares), price: n(row.price), commission: n(row.commission),
          capital_portion: row.capital_portion == null ? null : n(row.capital_portion),
          profit_portion: row.profit_portion == null ? null : n(row.profit_portion),
        }));
        const cashMovements = (cash.data ?? []).map((row) => ({ ...row, kind: row.kind as "DEPOSIT" | "WITHDRAWAL" | "FEE", amount: n(row.amount) }));
        const marketPrices = (prices.data ?? []).map((row) => ({ ...row, source: row.source as "MANUAL" | "API" | "LAST_TRADE", price: n(row.price) }));
        const accounting = computeAccounting(transactions, cashMovements, marketPrices, settings.data?.cost_basis_method === "FIFO" ? "FIFO" : "WAC");
        const portfolioContext = {
          generatedAt: new Date().toISOString(),
          currency: settings.data?.currency ?? "EGP",
          costBasisMethod: settings.data?.cost_basis_method ?? "WAC",
          totals: accounting.totals,
          positions: accounting.positions,
          transactions,
          cashMovements,
          marketPrices,
          warnings: accounting.warnings,
          reconciliation: accounting.reconciliation,
        };

        const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
        const openai = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: lovableKey,
          headers: { "Lovable-API-Key": lovableKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });
        const result = streamText({
          model: openai.responses("openai/gpt-6-astra"),
          messages: await convertToModelMessages(messages),
          abortSignal: request.signal,
          system: `You are EGX Ledger's portfolio analyst. Answer only from the supplied portfolio data. Be mathematically precise, distinguish realized from unrealized performance, capital from profit, and manual/stale prices from live quotes. Never invent market news or prices. State when a conclusion is limited by missing or manually entered prices. Explain clearly and concisely; use tables or bullets when useful. This is analysis, not personalized financial advice.\n\nCURRENT PORTFOLIO DATA:\n${JSON.stringify(portfolioContext)}`,
          providerOptions: { openai: { forceReasoning: true, reasoningEffort: "medium", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
        });
        const response = result.toUIMessageStreamResponse({
          originalMessages: messages,
          sendReasoning: true,
          onEnd: async ({ responseMessage, outcome }) => {
            if (outcome.status !== "completed") return;
            const { error } = await supabase.from("ai_messages").upsert(
              {
                conversation_id: conversationId,
                user_id: userId,
                sdk_message_id: responseMessage.id,
                role: "assistant",
                parts: responseMessage.parts as Json,
              },
              { onConflict: "user_id,conversation_id,sdk_message_id", ignoreDuplicates: true },
            );
            if (error) console.error("Could not persist assistant message", error.message);
            const titleText = lastUser.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ").trim();
            if (conversation.title === "New conversation" && titleText) {
              await supabase.from("ai_conversations").update({ title: titleText.slice(0, 64), updated_at: new Date().toISOString() }).eq("id", conversationId);
            } else {
              await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
            }
          },
        });
        return withLovableAiGatewayRunIdHeader(response, runIdFetch);
      },
    },
  },
});