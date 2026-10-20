import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Synqo CRM - Chatbot WhatsApp con IA & Agendamiento',
  description: 'CRM comercial multi-inquilino de gestión de leads de WhatsApp integrados con Inteligencia Artificial y agendamiento automático.',
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

