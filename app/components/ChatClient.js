"use client";

import { marked } from "marked";
import { useEffect, useMemo, useRef, useState } from "react";

marked.setOptions({ breaks: true });

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
  const pendingAssistantId = useRef(null);

  const newMessageId = () => {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch {
      // ignore
    }
    return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

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
    const userMessage = { id: newMessageId(), role: "user", text: question, createdAt: now };
    const assistantMessage = {
      id: newMessageId(),
      role: "assistant",
      text: "",
      groundingStatus: "pending",
      citations: [],
      done: false,
      createdAt: now
    };
    setMessages((prev) => {
      const next = [...prev, userMessage, assistantMessage];
      pendingAssistantId.current = assistantMessage.id;
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
              const indexFromId = pendingAssistantId.current
                ? next.findIndex((m) => m.id === pendingAssistantId.current)
                : -1;
              const index = indexFromId >= 0 ? indexFromId : next.length - 1;
              const current = next[index];
              if (!current || current.role !== "assistant") return next;
              next[index] = { ...current, text: `${current.text}${data.value}` };
              return next;
            });
          }
          if (data.type === "meta") {
            setMessages((prev) => {
              const next = [...prev];
              const indexFromId = pendingAssistantId.current
                ? next.findIndex((m) => m.id === pendingAssistantId.current)
                : -1;
              const index = indexFromId >= 0 ? indexFromId : next.length - 1;
              const current = next[index];
              if (!current || current.role !== "assistant") return next;
              next[index] = {
                ...current,
                groundingStatus: data.groundingStatus,
                citations: data.citations || [],
                done: true
              };
              return next;
            });
          }
          if (data.type === "done") {
            setMessages((prev) => {
              const next = [...prev];
              const indexFromId = pendingAssistantId.current
                ? next.findIndex((m) => m.id === pendingAssistantId.current)
                : -1;
              const index = indexFromId >= 0 ? indexFromId : next.length - 1;
              const current = next[index];
              if (!current || current.role !== "assistant") return next;
              if (current.done) return next;
              next[index] = { ...current, done: true };
              return next;
            });
          }
        });
      }
    } catch (error) {
      setMessages((prev) => {
        const next = [...prev];
        const indexFromId = pendingAssistantId.current
          ? next.findIndex((m) => m.id === pendingAssistantId.current)
          : -1;
        const index = indexFromId >= 0 ? indexFromId : next.length - 1;
        next[index] = {
          ...next[index],
          text: "משהו השתבש בשליחת הבקשה. נסו שוב בעוד רגע.",
          groundingStatus: "not_applicable",
          done: true
        };
        return next;
      });
    } finally {
      pendingAssistantId.current = null;
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
              אני כאן לעזור לך ללמוד את חומרי הקורס &quot;מבוא לאתיקה&quot;. אני עונה על שאלות
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
            key={message.id ? `${message.id}` : `${message.role}-${index}`}
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
                <>
                  {message.role === "assistant" ? (
                    message.done ? (
                      <div
                        className="message-text"
                        dangerouslySetInnerHTML={{ __html: marked.parse(message.text || "") }}
                      />
                    ) : (
                      <div className="message-text message-text--streaming">{message.text}</div>
                    )
                  ) : (
                    <div className="message-text">{message.text}</div>
                  )}
                </>
              )}

              {message.role === "assistant" &&
                (message.groundingStatus === "grounded" || message.groundingStatus === "weak") && (
                  <div className="grounding-pill">
                    מבוסס על חומרי הקורס
                    {message.groundingStatus === "weak" ? " (חלש)" : ""}
                  </div>
                )}

              {message.role === "assistant" && message.groundingStatus === "not_found" && (
                <div className="no-grounding-warning">
                  התשובה לא נמצאה בחומרי הקורס
                </div>
              )}

              {message.role === "assistant" && message.groundingStatus === "weak" && (
                <div className="no-grounding-warning">
                  תשובה עם מקור חלש — מומלץ לחדד שבוע/מושג או לשאול ממוקד יותר
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
          {lastAssistant?.groundingStatus === "not_found" && (
            <span className="footer-note">אפשר לחדד שבוע, מושג או שם של פרק.</span>
          )}
        </div>
      </form>
    </>
  );
}
