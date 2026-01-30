import ChatClient from "./components/ChatClient";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="chat-container">
      <header className="chat-header">
        <Image
          src="https://www.kinneret.ac.il/wp-content/uploads/2026/01/Kinneret_Logo_RGB_Hebrew_01.png.webp"
          alt="לוגו האקדמית כנרת"
          width={160}
          height={48}
          priority
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
