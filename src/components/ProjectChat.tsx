"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Sparkles, Send, Wand2 } from "lucide-react";
import Reveal from "./Reveal";
import AdvisorRecommendation, {
  parseRecommendation,
  type Recommendation,
} from "./AdvisorRecommendation";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  recommendation?: Recommendation;
};

type ContactStatus = "idle" | "saving" | "saved" | "error";

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Pozdravljeni! Povejte mi, s čim se ukvarja vaše podjetje in kje trenutno izgubljate največ časa ali denarja — na podlagi tega vam pripravim konkreten predlog rešitve.",
};

const STARTER_PROMPTS = [
  "Imam obrt in preveč papirja",
  "Nimam pregleda nad poslovanjem",
  "Stranke me prehitevajo z vprašanji",
  "Želim avtomatizirati naročila in fakture",
];

const STEPS = [
  "Opišite podjetje in težavo",
  "AI analizira potrebe",
  "Prejmete priporočilo",
];

export default function ProjectChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactStatus, setContactStatus] = useState<ContactStatus>("idle");
  const [contactError, setContactError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, recommendationLoading]);

  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const hasRecommendation = messages.some((m) => m.recommendation);

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Napaka pri pošiljanju sporočila.");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply as string },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Prišlo je do napake. Poskusite znova."
      );
    } finally {
      setLoading(false);
    }
  }

  async function getRecommendation() {
    if (recommendationLoading) return;
    setRecommendationLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, mode: "recommendation" }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Napaka pri pripravi priporočila.");
      }

      const reply = data.reply as string;
      const parsed = parseRecommendation(reply);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: reply,
          recommendation: parsed ?? undefined,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Prišlo je do napake. Poskusite znova."
      );
    } finally {
      setRecommendationLoading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  async function saveContact() {
    if (!email.trim() && !phone.trim()) {
      setContactError("Vnesite vsaj email ali telefon in poskusite znova.");
      setContactStatus("error");
      return;
    }

    setContactStatus("saving");
    setContactError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone, messages }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setContactError(
          data?.error ?? "Prišlo je do napake. Poskusite znova."
        );
        setContactStatus("error");
        return;
      }
      setContactStatus("saved");
    } catch {
      setContactError("Prišlo je do napake. Poskusite znova.");
      setContactStatus("error");
    }
  }

  return (
    <section id="projekt" className="relative scroll-mt-24 py-28 sm:py-36">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <Reveal className="text-center">
          <p className="text-sm font-medium text-accent">AI poslovni svetovalec</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Povejte nam o svojem podjetju
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-zinc-500">
            Opišite, s čim se ukvarjate, katere težave rešujete in kaj bi
            radi avtomatizirali — svetovalec vam pripravi konkretno
            priporočilo in vas povabi na konzultacijo.
          </p>
        </Reveal>

        <Reveal
          delay={0.05}
          className="mx-auto mt-10 flex max-w-lg flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs font-medium text-zinc-400"
        >
          {STEPS.map((step, index) => (
            <span key={step} className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-[10px] text-accent">
                  {index + 1}
                </span>
                {step}
              </span>
              {index < STEPS.length - 1 && (
                <span className="text-zinc-300">→</span>
              )}
            </span>
          ))}
        </Reveal>

        <Reveal
          delay={0.1}
          className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-ink shadow-2xl shadow-zinc-900/20"
        >
          <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2">
              <Wand2 className="h-4 w-4 text-white" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">
                AI poslovni svetovalec
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Na voljo zdaj
              </p>
            </div>
          </div>

          <div className="flex max-h-[460px] flex-col gap-4 overflow-y-auto px-5 py-6">
            {messages.map((message, index) => (
              <ChatBubble key={index} message={message} />
            ))}

            {messages.length === 1 && (
              <div className="ml-11 flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-zinc-300 transition hover:border-accent/40 hover:text-white"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {loading && <TypingBubble />}
            {recommendationLoading && <RecommendationLoadingBubble />}
            {error && (
              <p className="text-center text-xs text-red-400">{error}</p>
            )}
            <div ref={bottomRef} />
          </div>

          {userMessageCount >= 1 && !hasRecommendation && (
            <div className="border-t border-white/10 bg-white/[0.02] px-5 py-3.5">
              <motion.button
                type="button"
                onClick={getRecommendation}
                disabled={recommendationLoading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-5 py-2.5 text-sm font-semibold text-accent-2 transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {recommendationLoading
                  ? "Pripravljam priporočilo …"
                  : "Prejmi priporočilo za moj projekt"}
              </motion.button>
            </div>
          )}

          <div className="border-t border-white/10 px-5 py-4">
            <div className="flex items-end gap-3 rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-3 transition-colors focus-within:border-accent/50 focus-within:bg-white/[0.07]">
              <textarea
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Napišite svojo idejo, projekt ali težavo — naredili vam bomo plan za rešitev."
                className="max-h-24 flex-1 resize-none bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
              />
              <motion.button
                type="button"
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-accent to-accent-2 text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Pošlji sporočilo"
              >
                <Send className="h-4 w-4" />
              </motion.button>
            </div>
          </div>

          <ContactCapture
            email={email}
            phone={phone}
            status={contactStatus}
            error={contactError}
            onEmailChange={setEmail}
            onPhoneChange={setPhone}
            onSave={saveContact}
          />
        </Reveal>
      </div>
    </section>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (message.recommendation) {
    return (
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2">
          <Wand2 className="h-3.5 w-3.5 text-white" />
        </span>
        <div className="max-w-[85%] flex-1">
          <AdvisorRecommendation recommendation={message.recommendation} />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2">
          <Wand2 className="h-3.5 w-3.5 text-white" />
        </span>
      )}
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm text-zinc-200 ${
          isUser
            ? "rounded-tr-sm bg-gradient-to-r from-accent/20 to-accent-2/20"
            : "rounded-tl-sm bg-white/5"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2">
        <Wand2 className="h-3.5 w-3.5 text-white" />
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-white/5 px-4 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
      </div>
    </div>
  );
}

function RecommendationLoadingBubble() {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2">
        <Sparkles className="h-3.5 w-3.5 animate-pulse text-white" />
      </span>
      <div className="rounded-2xl rounded-tl-sm border border-accent/20 bg-accent/[0.06] px-4 py-3 text-xs text-zinc-300">
        Analiziram pogovor in pripravljam priporočilo …
      </div>
    </div>
  );
}

function ContactCapture({
  email,
  phone,
  status,
  error,
  onEmailChange,
  onPhoneChange,
  onSave,
}: {
  email: string;
  phone: string;
  status: ContactStatus;
  error: string | null;
  onEmailChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="border-t border-white/10 bg-white/[0.02] px-5 py-5">
      <p className="text-xs font-medium text-zinc-400">
        Želite, da vas kontaktiramo? Pustite email ali telefon.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="vas.email@primer.si"
          className="flex-1 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-accent/50 focus:outline-none"
        />
        <input
          type="tel"
          value={phone}
          onChange={(event) => onPhoneChange(event.target.value)}
          placeholder="040 123 456"
          className="flex-1 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-accent/50 focus:outline-none"
        />
        <motion.button
          type="button"
          onClick={onSave}
          disabled={status === "saving"}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="rounded-full bg-gradient-to-r from-accent to-accent-2 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "saving" ? "Shranjujem …" : "Shrani kontakt"}
        </motion.button>
      </div>
      {status === "saved" && (
        <p className="mt-2 text-xs text-emerald-400">
          Hvala! Kontaktirali vas bomo v najkrajšem možnem času.
        </p>
      )}
      {status === "error" && error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
