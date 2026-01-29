import ChatClient from "./components/ChatClient";

export default function HomePage() {
  return (
    <main>
      <div className="shell">
        <section className="hero">
          <h1>מדריך האתיקה של הקורס</h1>
          <p>
            כאן שואלים כל שאלה על חומרי הקורס בלבד. אני מחפש/ת אך ורק בתוך המצגות,
            הסיכומים והמסמכים של הקורס ומחזיר/ה תשובה בעברית עם הפניות שבוע/חלק.
          </p>
        </section>
        <section className="panel">
          <ChatClient />
        </section>
      </div>
    </main>
  );
}
