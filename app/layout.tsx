import type { Metadata } from "next";
import { Fraunces, Karla } from "next/font/google";
import "./globals.css";

// latin-ext covers the diacritics in player and club names (Džeko, Šehić,
// Krunić). Fraunces is variable, so no weight list — its soft/optical axes are
// what give the Jadran headings their warmth, the same as on Pričaj.
const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-fraunces",
  display: "swap",
});
const sans = Karla({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-karla",
});

export const metadata: Metadata = {
  title: "Bosnian Support Schedule — by Pričaj",
  description:
    "Every upcoming club match for Bosnia and Herzegovina's senior men's and women's national team players, in one schedule. Built by Pričaj.",
};

// Restore the saved theme before paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('bih-schedule-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
