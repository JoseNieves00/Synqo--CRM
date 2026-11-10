import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

export const viewport: Viewport = {
  themeColor: '#0052FF',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://synqo.dev'),
  title: 'Synqo CRM | Tu mejor vendedor opera en la web 24/7',
  description: 'Desarrollo web de alto rendimiento y CRM comercial con Inteligencia Artificial para WhatsApp y agendamiento sincronizado.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Synqo CRM',
  },
  icons: {
    icon: [
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/brand/favicon-180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
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
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-canvas text-foreground antialiased selection:bg-[#0052FF]/20">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
