"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const initialMessages = [];

function splitSseEvents(buffer) {
  const events = buffer.split("\n\n");
  const remainder = events.pop();
  return { events, remainder };
}

function parseSseData(eventChunk) {
  const line = eventChunk
    .split("\n")
    .find((item) => item.startsWith("data: "));
  if (!line) return null;
  const payload = line.replace("data: ", "").trim();
  if (!payload || payload === "[DONE]") return { type: "done" };
  try {
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
}

export default function ChatClient() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);
  const pendingIndex = useRef(null);

  useEffect(() => {
    if (!chatRef.current) return;
    chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const lastAssistant = useMemo(() => {
    const list = [...messages].reverse();
    return list.find((item) => item.role === "assistant");
  }, [messages]);

  const sendMessage = async (question) => {
    if (!question.trim() || loading) return;
    setLoading(true);
    const userMessage = { role: "user", text: question };
    const assistantMessage = {
      role: "assistant",
      text: "",
      groundingStatus: "pending",
      citations: []
    };
    setMessages((prev) => {
      const next = [...prev, userMessage, assistantMessage];
      pendingIndex.current = next.length - 1;
      return next;
    });

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });

      if (!response.ok || !response.body) {
        throw new Error("Request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = splitSseEvents(buffer);
        buffer = remainder;

        events.forEach((eventChunk) => {
          const data = parseSseData(eventChunk);
          if (!data) return;
          if (data.type === "chunk") {
            setMessages((prev) => {
              const next = [...prev];
              const index = pendingIndex.current ?? next.length - 1;
              const current = next[index];
              next[index] = { ...current, text: `${current.text}${data.value}` };
              return next;
            });
          }
          if (data.type === "meta") {
            setMessages((prev) => {
              const next = [...prev];
              const index = pendingIndex.current ?? next.length - 1;
              const current = next[index];
              next[index] = {
                ...current,
                groundingStatus: data.groundingStatus,
                citations: data.citations || []
              };
              return next;
            });
          }
        });
      }
    } catch (error) {
      setMessages((prev) => {
        const next = [...prev];
        const index = pendingIndex.current ?? next.length - 1;
        next[index] = {
          ...next[index],
          text: "משהו השתבש בשליחת הבקשה. נסו שוב בעוד רגע.",
          groundingStatus: "not_applicable"
        };
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const question = input.trim();
    if (!question) return;
    setInput("");
    sendMessage(question);
  };

  const handleSources = () => {
    sendMessage("אפשר לקבל את המקורות? תודה.");
  };

  return (
    <div className="input-row">
      <div className="chat-window" ref={chatRef}>
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`}>
            <div className={`message ${message.role}`}>
              {message.text || "..."}
            </div>
            {message.role === "assistant" &&
              message.groundingStatus &&
              message.groundingStatus !== "not_applicable" && (
              <div className="meta">
                <span className={`badge ${message.groundingStatus === "grounded" ? "" : "warn"}`}>
                  {message.groundingStatus === "grounded" && "מבוסס על חומרי הקורס"}
                  {message.groundingStatus === "not_found" && "אין התאמה בחומר"}
                  {message.groundingStatus === "not_applicable" && "לא רלוונטי למקורות"}
                  {message.groundingStatus === "pending" && "מחפש מקורות"}
                </span>
                {message.citations && message.citations.length > 0 && (
                  <span className="badge">
                    {message.citations.join(" · ")}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="input-row" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="שאלה מתוך החומר..."
          dir="rtl"
        />
        <div className="actions">
          <button type="submit" disabled={loading}>
            {loading ? "מנסח תשובה..." : "שליחה"}
          </button>
          <button type="button" className="secondary" onClick={handleSources} disabled={loading}>
            בקש/י מקורות
          </button>
          {lastAssistant?.groundingStatus === "not_found" && (
            <span className="footer-note">אפשר לחדד שבוע, מושג או שם של פרק.</span>
          )}
        </div>
      </form>
    </div>
  );
}
