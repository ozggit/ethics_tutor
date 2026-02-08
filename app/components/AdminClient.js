"use client";

import { useEffect, useState } from "react";

export default function AdminClient() {
  const driveSyncDisabled =
    process.env.NEXT_PUBLIC_DISABLE_DRIVE_SYNC === "true" || process.env.NODE_ENV !== "production";

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

  const [analyticsResetStatus, setAnalyticsResetStatus] = useState("idle");
  const [analyticsResetCount, setAnalyticsResetCount] = useState(0);

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
    if (driveSyncDisabled) {
      setSyncStatus("disabled_local");
      return;
    }

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

  const connectDrive = async () => {
    const res = await fetch("/api/admin/oauth/start");
    const data = await res.json();
    const nextUrl = data.authUrl || authUrl;
    if (nextUrl) {
      window.location.href = nextUrl;
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
      setModelStatus(res.ok ? "saved" : "failed");
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
      setStoreStatus(res.ok ? "saved" : "failed");
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
      if (!res.ok) {
        setStoreCreateStatus("failed");
        return;
      }
      setStoreValue(data.store || "");
      setStoreStatus("saved");
      setStoreCreateStatus("saved");
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
      setDriveFolderStatus(res.ok ? "saved" : "failed");
    } catch (error) {
      setDriveFolderStatus("failed");
    }
  };

  const resetAnalytics = async () => {
    const confirmed = window.confirm(
      "Reset all analytics data? This permanently deletes aggregated history."
    );
    if (!confirmed) return;

    setAnalyticsResetStatus("running");
    setAnalyticsResetCount(0);

    try {
      const res = await fetch("/api/admin/analytics/reset", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAnalyticsResetStatus("failed");
        return;
      }
      setAnalyticsResetStatus("saved");
      setAnalyticsResetCount(Number(data.deletedCount || 0));
      await loadAnalytics();
    } catch (error) {
      setAnalyticsResetStatus("failed");
    }
  };

  return (
    <div className="input-row">
      <div className="actions">
        <button onClick={runSync} disabled={syncStatus === "running" || driveSyncDisabled}>
          {syncStatus === "running" ? "Syncing..." : "Run sync"}
        </button>
        {syncStatus === "needs_oauth" && !driveSyncDisabled && (
          <button className="secondary" onClick={connectDrive}>
            Connect Google Drive
          </button>
        )}
        <button className="secondary" onClick={loadAnalytics}>
          Refresh analytics
        </button>
        <button
          className="secondary secondary-danger"
          onClick={resetAnalytics}
          disabled={analyticsResetStatus === "running"}
        >
          {analyticsResetStatus === "running" ? "Resetting analytics..." : "Reset analytics"}
        </button>

        {driveSyncDisabled && (
          <span className="footer-note">Drive sync is disabled in local development mode.</span>
        )}
        {syncStatus !== "idle" && <span className="footer-note">Sync status: {syncStatus}</span>}
        {analyticsResetStatus === "saved" && (
          <span className="footer-note">Analytics reset complete ({analyticsResetCount} rows).</span>
        )}
        {analyticsResetStatus === "failed" && (
          <span className="footer-note">Failed to reset analytics.</span>
        )}
      </div>

      <div className="panel">
        <h3>Gemini model</h3>
        <div className="actions">
          <input
            className="model-input"
            value={modelValue}
            onChange={(event) => setModelValue(event.target.value)}
            placeholder="models/gemini-3-pro-preview"
          />
          <button onClick={saveModel} disabled={modelStatus === "saving"}>
            {modelStatus === "saving" ? "Saving..." : "Save"}
          </button>
          {modelStatus === "saved" && <span className="footer-note">Saved</span>}
          {modelStatus === "failed" && <span className="footer-note">Failed to save</span>}
        </div>
        <div className="footer-note">
          Enter a full model name, for example: models/gemini-3-flash-preview
        </div>
      </div>

      <div className="panel">
        <h3>File Search Store</h3>
        <div className="actions">
          <input
            className="model-input"
            value={storeValue}
            onChange={(event) => setStoreValue(event.target.value)}
            placeholder="fileSearchStores/your-store-id"
          />
          <button onClick={saveStore} disabled={storeStatus === "saving"}>
            {storeStatus === "saving" ? "Saving..." : "Save"}
          </button>
          {storeStatus === "saved" && <span className="footer-note">Saved</span>}
          {storeStatus === "failed" && <span className="footer-note">Failed to save</span>}
        </div>
        <div className="footer-note">
          Changing the store clears Drive sync cache and causes a full file re-upload on next sync.
        </div>
        <div className="actions">
          <input
            className="model-input"
            value={storeCreateName}
            onChange={(event) => setStoreCreateName(event.target.value)}
            placeholder="Ethics Course Store"
          />
          <button onClick={createStore} disabled={storeCreateStatus === "saving"}>
            {storeCreateStatus === "saving" ? "Creating..." : "Create new store"}
          </button>
          {storeCreateStatus === "saved" && <span className="footer-note">Created</span>}
          {storeCreateStatus === "failed" && <span className="footer-note">Failed to create</span>}
        </div>
      </div>

      <div className="panel">
        <h3>Google Drive folder</h3>
        <div className="actions">
          <input
            className="model-input"
            value={driveFolderValue}
            onChange={(event) => setDriveFolderValue(event.target.value)}
            placeholder="Drive Folder ID"
          />
          <button onClick={saveDriveFolder} disabled={driveFolderStatus === "saving"}>
            {driveFolderStatus === "saving" ? "Saving..." : "Save"}
          </button>
          {driveFolderStatus === "saved" && <span className="footer-note">Saved</span>}
          {driveFolderStatus === "failed" && <span className="footer-note">Failed to save</span>}
        </div>
        <div className="footer-note">Set the Drive folder ID used for course material sync.</div>
      </div>

      {analytics && (
        <>
          <div className="admin-grid">
            <div className="stat">
              <h3>Total questions</h3>
              <span>{analytics.totalQuestions}</span>
            </div>
            <div className="stat">
              <h3>Anonymous sessions</h3>
              <span>{analytics.anonymousUsers || 0}</span>
              <div className="stat-footnote">Approx. unique browser sessions</div>
            </div>
            <div className="stat">
              <h3>Grounded answer rate</h3>
              <span>{analytics.groundedRate}%</span>
            </div>
            <div className="stat">
              <h3>Average response time</h3>
              <span>{analytics.avgLatencyMs}ms</span>
            </div>
          </div>

          <div className="analytics-help">
            <h3>How to read this</h3>
            <div className="footer-note">
              Anonymous sessions are salted-hash session IDs, not names, emails, or student IDs.
            </div>
            <div className="footer-note">
              One student using multiple browsers/devices can count as more than one session.
            </div>
            <div className="footer-note">
              Multiple students sharing one browser can count as one session.
            </div>
          </div>

          <div>
            <h3>Last 7 days</h3>
            <div className="list">
              {(analytics.last7Days || []).map((item) => (
                <div className="list-item" key={item.date}>
                  {item.date}: {item.count}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3>Top questions</h3>
            <div className="list">
              {(analytics.topQueries || []).map((item) => (
                <div className="list-item" key={item.question}>
                  <div className="list-item-title">{item.question}</div>
                  <div className="list-item-meta">
                    {item.topic} | {item.count} questions | {item.uniqueUsers} anonymous sessions
                  </div>
                </div>
              ))}
              {(!analytics.topQueries || analytics.topQueries.length === 0) && (
                <div className="list-item">No data yet.</div>
              )}
            </div>
          </div>

          <div>
            <h3>Hard topics</h3>
            <div className="list">
              {(analytics.hardTopics || []).map((item) => (
                <div className="list-item" key={item.topic}>
                  <div className="list-item-title">{item.topic}</div>
                  <div className="list-item-meta">
                    {item.totalQuestions} questions | {item.uniqueUsers} anonymous sessions |{" "}
                    {item.repeatBySameUser} same-session repeats
                  </div>
                  {item.sampleQuestion && (
                    <div className="list-item-note">Sample question: {item.sampleQuestion}</div>
                  )}
                </div>
              ))}
              {(!analytics.hardTopics || analytics.hardTopics.length === 0) && (
                <div className="list-item">Not enough data yet.</div>
              )}
            </div>
          </div>

          <div>
            <h3>Same-session repeated questions</h3>
            <div className="list">
              {(analytics.repeatPatterns || []).map((item) => (
                <div className="list-item" key={item.question}>
                  <div className="list-item-title">{item.question}</div>
                  <div className="list-item-meta">
                    {item.repeatBySameUser} repeated asks | {item.repeatUsers} sessions repeated
                  </div>
                </div>
              ))}
              {(!analytics.repeatPatterns || analytics.repeatPatterns.length === 0) && (
                <div className="list-item">No repeated patterns yet.</div>
              )}
            </div>
          </div>

          {syncErrors.length > 0 && (
            <div>
              <h3>Recent sync errors</h3>
              <div className="list">
                {syncErrors.map((item) => (
                  <div className="list-item" key={item.fileId}>
                    {item.name} ({item.mimeType}) - {item.error}
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
