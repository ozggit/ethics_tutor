"use client";

import { useEffect, useState } from "react";

export default function AdminClient() {
  const [analytics, setAnalytics] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [authUrl, setAuthUrl] = useState("");

  const loadAnalytics = async () => {
    const res = await fetch("/api/admin/analytics", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setAnalytics(data);
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const runSync = async () => {
    setSyncStatus("running");
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data = await res.json();
      if (data.status === "needs_oauth") {
        setSyncStatus("needs_oauth");
        setAuthUrl(data.authUrl || "");
        return;
      }
      setAuthUrl("");
      setSyncStatus(data.status || "completed");
    } catch (error) {
      setSyncStatus("failed");
    } finally {
      loadAnalytics();
    }
  };

  const connectDrive = async () => {
    const res = await fetch("/api/admin/oauth/start");
    const data = await res.json();
    const nextUrl = data.authUrl || authUrl;
    if (nextUrl) {
      window.location.href = nextUrl;
    }
  };

  return (
    <div className="input-row">
      <div className="actions">
        <button onClick={runSync} disabled={syncStatus === "running"}>
          {syncStatus === "running" ? "מסנכרן..." : "הפעל סנכרון"}
        </button>
        {syncStatus === "needs_oauth" && (
          <button className="secondary" onClick={connectDrive}>
            חיבור ל-Google Drive
          </button>
        )}
        <button className="secondary" onClick={loadAnalytics}>
          רענון נתונים
        </button>
        {syncStatus !== "idle" && (
          <span className="footer-note">סטטוס: {syncStatus}</span>
        )}
      </div>

      {analytics && (
        <>
          <div className="admin-grid">
            <div className="stat">
              <h3>סה"כ שאלות</h3>
              <span>{analytics.totalQuestions}</span>
            </div>
            <div className="stat">
              <h3>שיעור תשובות מבוססות</h3>
              <span>{analytics.groundedRate}%</span>
            </div>
            <div className="stat">
              <h3>ציטוטים ממוצעים</h3>
              <span>{analytics.avgCitations}</span>
            </div>
            <div className="stat">
              <h3>זמן מענה ממוצע</h3>
              <span>{analytics.avgLatencyMs}ms</span>
            </div>
          </div>
          <div>
            <h3>7 הימים האחרונים</h3>
            <div className="list">
              {analytics.last7Days.map((item) => (
                <div className="list-item" key={item.date}>
                  {item.date}: {item.count}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3>שאלות חוזרות</h3>
            <div className="list">
              {analytics.topQueries.map((item) => (
                <div className="list-item" key={item.question}>
                  {item.question} ({item.count})
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
