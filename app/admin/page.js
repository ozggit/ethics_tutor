import AdminClient from "../components/AdminClient";

export default function AdminPage() {
  return (
    <main>
      <div className="shell">
        <section className="hero">
          <h1>ניהול והסתכלות מערכת</h1>
          <p>
            כאן מסנכרנים את התוכן מ-Google Drive ומקבלים תמונת מצב על שימוש,
            מקורות והיקף מענה.
          </p>
        </section>
        <section className="panel">
          <AdminClient />
        </section>
      </div>
    </main>
  );
}
