import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Toaster } from 'sonner';
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UPA Flow - Premium Health System",
  description: "Modern healthcare management with boutique experience",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br">
      <body
        className={`${outfit.variable} font-sans antialiased`}
      >
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '20px',
              fontFamily: 'var(--font-outfit)',
            },
          }}
        />
      </body>
    </html>
  );
}
