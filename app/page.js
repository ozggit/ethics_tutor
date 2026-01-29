import ChatClient from "./components/ChatClient";

export default function HomePage() {
  return (
    <div className="chat-container">
      <header className="chat-header">
        <img
          src="https://www.kinneret.ac.il/wp-content/uploads/2026/01/Kinneret_Logo_RGB_Hebrew_01.png.webp"
          alt="לוגו האקדמית כנרת"
        />
        <div className="chat-header-text">
          <h1>מורה אתיקה</h1>
          <p>עוזר לימודי חכם לקורס מבוא לאתיקה</p>
        </div>
        <span className="header-badge">AI</span>
      </header>
      <ChatClient />
    </div>
  );
}
