"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Modal } from "@/core/ui/modal";
import { cn } from "@/core/lib/utils";
import { getContestChatHistory, sendContestChatMessage } from "../actions";

type Message = { role: "user" | "assistant"; content: string };

export function ChatPanel({
  open,
  onClose,
  campaignKey,
  campaignLabel,
  month,
}: {
  open: boolean;
  onClose: () => void;
  campaignKey: string;
  campaignLabel: string;
  month: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      setError(null);
      const history = await getContestChatHistory(campaignKey, month);
      setMessages(history);
    });
  }, [open, campaignKey, month, startTransition]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    startTransition(async () => {
      const res = await sendContestChatMessage(campaignKey, month, text);
      setLoading(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: res.reply ?? "" }]);
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Chat with Vero" size="lg">
      <p className="mb-3 -mt-2 text-xs text-muted-foreground">
        Scoped to <span className="font-medium text-foreground">{campaignLabel}</span>,{" "}
        {new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}. Ask about sales,
        execution, or stock — anything else is out of scope.
      </p>

      <div ref={scrollRef} className="mb-3 max-h-[55vh] min-h-[220px] space-y-3 overflow-y-auto rounded-xl border border-border bg-input p-3">
        {messages.length === 0 && !isPending && (
          <p className="p-2 text-center text-xs text-muted-foreground">
            Try: &quot;Is this campaign working?&quot; or &quot;Why did GMV dip in week 3?&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                m.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground",
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-border bg-card px-3.5 py-2 text-sm text-muted-foreground">Thinking…</div>
          </div>
        )}
      </div>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask about this campaign…"
          disabled={loading}
          className="flex-1 rounded-xl border border-transparent bg-input px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={loading || !input.trim()}
          aria-label="Send"
          className="flex shrink-0 items-center justify-center rounded-xl bg-primary px-3.5 text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </Modal>
  );
}
