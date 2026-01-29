"use client";

import { useEffect, useState } from "react";

export default function AdminClient() {
  const [analytics, setAnalytics] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [authUrl, setAuthUrl] = useState("");
  const [syncErrors, setSyncErrors] = useState([]);
  const [modelValue, setModelValue] = useState("");
  const [modelStatus, setModelStatus] = useState("idle");
  const [storeValue, setStoreValue] = useState("");
  const [storeStatus, setStoreStatus] = useState("idle");
  const [storeCreateName, setStoreCreateName] = useState("Ethics Course Store");
  const [storeCreateStatus, setStoreCreateStatus] = useState("idle");
  const [driveFolderValue, setDriveFolderValue] = useState("");
  const [driveFolderStatus, setDriveFolderStatus] = useState("idle");

  const loadAnalytics = async () => {
    const res = await fetch("/api/admin/analytics", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setAnalytics(data);
  };

  const loadModel = async () => {
    const res = await fetch("/api/admin/model", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setModelValue(data.model || "");
  };

  const loadStore = async () => {
    const res = await fetch("/api/admin/store", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setStoreValue(data.store || "");
  };

  const loadDriveFolder = async () => {
    const res = await fetch("/api/admin/drive-folder", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setDriveFolderValue(data.folder || "");
  };

  useEffect(() => {
    loadAnalytics();
    loadModel();
    loadStore();
    loadDriveFolder();
  }, []);

  const runSync = async () => {
    setSyncStatus("running");
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data = await res.json();
      if (data.status === "needs_oauth") {
        setSyncStatus("needs_oauth");
        setAuthUrl(data.authUrl || "");
        setSyncErrors([]);
        return;
      }
      setSyncErrors(data.errors || []);
      setAuthUrl("");
      setSyncStatus(data.status || "completed");
    } catch (error) {
      setSyncStatus("failed");
      setSyncErrors([]);
    } finally {
      loadAnalytics();
    }
  };

  const saveModel = async () => {
    if (!modelValue.trim()) return;
    setModelStatus("saving");
    try {
      const res = await fetch("/api/admin/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelValue })
      });
      if (res.ok) {
        setModelStatus("saved");
      } else {
        setModelStatus("failed");
      }
    } catch (error) {
      setModelStatus("failed");
    }
  };

  const saveStore = async () => {
    if (!storeValue.trim()) return;
    setStoreStatus("saving");
    try {
      const res = await fetch("/api/admin/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store: storeValue })
      });
      if (res.ok) {
        setStoreStatus("saved");
      } else {
        setStoreStatus("failed");
      }
    } catch (error) {
      setStoreStatus("failed");
    }
  };

  const createStore = async () => {
    setStoreCreateStatus("saving");
    try {
      const res = await fetch("/api/admin/store/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: storeCreateName })
      });
      const data = await res.json();
      if (res.ok) {
        setStoreValue(data.store || "");
        setStoreStatus("saved");
        setStoreCreateStatus("saved");
      } else {
        setStoreCreateStatus("failed");
      }
    } catch (error) {
      setStoreCreateStatus("failed");
    }
  };

  const saveDriveFolder = async () => {
    if (!driveFolderValue.trim()) return;
    setDriveFolderStatus("saving");
    try {
      const res = await fetch("/api/admin/drive-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: driveFolderValue })
      });
      if (res.ok) {
        setDriveFolderStatus("saved");
      } else {
        setDriveFolderStatus("failed");
      }
    } catch (error) {
      setDriveFolderStatus("failed");
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

      <div className="panel">
        <h3>מודל Gemini פעיל</h3>
        <div className="actions">
          <input
            className="model-input"
            value={modelValue}
            onChange={(event) => setModelValue(event.target.value)}
            placeholder="models/gemini-3-pro-preview"
          />
          <button onClick={saveModel} disabled={modelStatus === "saving"}>
            {modelStatus === "saving" ? "שומר..." : "שמירה"}
          </button>
          {modelStatus === "saved" && <span className="footer-note">עודכן</span>}
          {modelStatus === "failed" && (
            <span className="footer-note">נכשל לעדכן</span>
          )}
        </div>
        <div className="footer-note">
          אפשר להדביק שם מודל מלא, למשל: models/gemini-3-flash-preview
        </div>
      </div>

      <div className="panel">
        <h3>File Search Store פעיל</h3>
        <div className="actions">
          <input
            className="model-input"
            value={storeValue}
            onChange={(event) => setStoreValue(event.target.value)}
            placeholder="fileSearchStores/your-store-id"
          />
          <button onClick={saveStore} disabled={storeStatus === "saving"}>
            {storeStatus === "saving" ? "שומר..." : "שמירה"}
          </button>
          {storeStatus === "saved" && <span className="footer-note">עודכן</span>}
          {storeStatus === "failed" && (
            <span className="footer-note">נכשל לעדכן</span>
          )}
        </div>
        <div className="footer-note">
          הדבק/י כאן Store חדש כדי להתחיל מאפס ולסנכרן מחדש.
        </div>
        <div className="actions">
          <input
            className="model-input"
            value={storeCreateName}
            onChange={(event) => setStoreCreateName(event.target.value)}
            placeholder="Ethics Course Store"
          />
          <button onClick={createStore} disabled={storeCreateStatus === "saving"}>
            {storeCreateStatus === "saving" ? "יוצר..." : "יצירת Store חדש"}
          </button>
          {storeCreateStatus === "saved" && <span className="footer-note">נוצר</span>}
          {storeCreateStatus === "failed" && (
            <span className="footer-note">נכשל ליצור</span>
          )}
        </div>
      </div>

      <div className="panel">
        <h3>Google Drive Folder</h3>
        <div className="actions">
          <input
            className="model-input"
            value={driveFolderValue}
            onChange={(event) => setDriveFolderValue(event.target.value)}
            placeholder="Drive Folder ID"
          />
          <button onClick={saveDriveFolder} disabled={driveFolderStatus === "saving"}>
            {driveFolderStatus === "saving" ? "שומר..." : "שמירה"}
          </button>
          {driveFolderStatus === "saved" && <span className="footer-note">עודכן</span>}
          {driveFolderStatus === "failed" && (
            <span className="footer-note">נכשל לעדכן</span>
          )}
        </div>
        <div className="footer-note">
          הדבק/י כאן את מזהה התיקייה שממנה נסנכרן את חומרי הקורס.
        </div>
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
          {syncErrors.length > 0 && (
            <div>
              <h3>שגיאות סנכרון אחרונות</h3>
              <div className="list">
                {syncErrors.map((item) => (
                  <div className="list-item" key={item.fileId}>
                    {item.name} ({item.mimeType}) – {item.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
