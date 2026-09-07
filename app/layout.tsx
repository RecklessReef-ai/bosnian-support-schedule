import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bosnian Support Schedule — by Pričaj",
  description:
    "Every upcoming club match for Bosnia and Herzegovina's senior men's and women's national team players, in one schedule. Built by Pričaj.",
};

// No font links and no theme script. The site is one fixed navy palette declared
// in `globals.css` and set on `body`, so there is nothing to restore before paint
// and nothing to flash; and it renders in the reader's own system face, so there
// is no font file standing between a cold load and the next kickoff.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
