import "./globals.css";
import { Heebo, Frank_Ruhl_Libre } from "next/font/google";

const bodyFont = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "700"]
});

const displayFont = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  variable: "--font-display",
  weight: ["400", "500", "700"]
});

export const metadata = {
  title: "Ethics Tutor",
  description: "Course-grounded chat tutor"
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
