"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const initialMessages = [];
const suggestions = [
  "מהי אתיקה תועלתנית?",
  "הסבר את הדילמה המוסרית",
  "מהם עקרונות קאנט?",
  "מהי אחריות מקצועית בניהול משאבי אנוש?"
];

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
    const now = Date.now();
    const userMessage = { role: "user", text: question, createdAt: now };
    const assistantMessage = {
      role: "assistant",
      text: "",
      groundingStatus: "pending",
      citations: [],
      createdAt: now
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
    <>
      <div className="chat-messages" ref={chatRef}>
        {messages.length === 0 && (
          <div className="welcome-card">
            <div className="welcome-icon">
              <span className="welcome-icon-letter">AI</span>
            </div>
            <h2>שלום! אני מורה האתיקה שלך</h2>
            <p>
              אני כאן לעזור לך ללמוד את חומרי הקורס "מבוא לאתיקה". אני עונה על שאלות
              <strong> רק על בסיס חומרי הקורס</strong> — ההרצאות והמאמרים.
            </p>
            <div className="suggestion-chips">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="suggestion-chip"
                  onClick={() => sendMessage(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`message ${message.role === "user" ? "message-user" : "message-assistant"}`}
          >
            <div className="message-bubble">
              {message.role === "assistant" && !message.text ? (
                <div className="typing-indicator">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              ) : (
                <span className="message-text">{message.text}</span>
              )}

              {message.role === "assistant" && message.citations?.length > 0 && (
                <div className="citations">
                  <div className="citations-title">מקורות מחומרי הקורס:</div>
                  {message.citations.map((citation) => (
                    <div className="citation-item" key={citation}>
                      • {citation}
                    </div>
                  ))}
                </div>
              )}

              {message.role === "assistant" && message.groundingStatus === "not_found" && (
                <div className="no-grounding-warning">
                  התשובה לא נמצאה בחומרי הקורס
                </div>
              )}
            </div>
            <div className="message-meta">
              {new Date(message.createdAt || Date.now()).toLocaleTimeString("he-IL", {
                hour: "2-digit",
                minute: "2-digit"
              })}
            </div>
          </div>
        ))}
      </div>

      <form className="chat-input-area" onSubmit={handleSubmit}>
        <div className="chat-input-wrapper">
          <textarea
            className="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="שאל שאלה על חומרי הקורס..."
            dir="rtl"
            rows={1}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              }
            }}
          />
          <button className="send-button" type="submit" disabled={loading}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M2 21l20-9L2 3v7l14 2-14 2v7z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={handleSources} disabled={loading}>
            בקש/י מקורות
          </button>
          {lastAssistant?.groundingStatus === "not_found" && (
            <span className="footer-note">אפשר לחדד שבוע, מושג או שם של פרק.</span>
          )}
        </div>
      </form>
    </>
  );
}
