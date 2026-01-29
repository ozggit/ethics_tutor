import "./globals.css";
import { Heebo } from "next/font/google";

const bodyFont = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700", "800"]
});

export const metadata = {
  title: "Ethics Tutor",
  description: "Course-grounded chat tutor"
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl" className={bodyFont.variable}>
      <body>{children}</body>
    </html>
  );
}
