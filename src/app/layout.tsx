import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agentic Canvas",
  description: "AI-powered workspace with dynamic component canvas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Inline script syncs dark mode class with system preference (no user input, XSS-safe)
  const darkModeScript = `
    (function() {
      var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', isDark);
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        document.documentElement.classList.toggle('dark', e.matches);
      });
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: darkModeScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
