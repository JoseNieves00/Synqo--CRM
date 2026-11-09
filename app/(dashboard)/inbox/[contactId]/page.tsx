import { redirect } from 'next/navigation';

interface InboxDetailPageProps {
  params: {
    contactId: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function InboxDetailPage({ params }: InboxDetailPageProps) {
  const { contactId } = params;
  redirect(`/inbox?c=${contactId}`);
}
