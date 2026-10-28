import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portal Colaboradores | Synqo CRM',
  description: 'Gestión móvil de agenda, horarios y comunicación interna para colaboradores y especialistas.',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950">
      {children}
    </div>
  );
}

