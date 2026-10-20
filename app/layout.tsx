import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://synqo.dev'),
  title: 'Synqo CRM | Tu mejor vendedor opera en la web 24/7',
  description: 'Desarrollo web de alto rendimiento y CRM comercial con Inteligencia Artificial para WhatsApp y agendamiento sincronizado.',
  icons: {
    icon: [
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/brand/favicon-180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Synqo - Syncing code, traffic and sales',
    description: 'Tu mejor vendedor opera en la web 24/7.',
    images: ['/brand/og-image-1200x630.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 antialiased">{children}</body>
    </html>
  );
}

