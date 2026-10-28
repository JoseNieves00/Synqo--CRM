import { validateStaffInvitation } from '@/app/actions/staff';
import { StaffJoinClient } from '@/components/staff/StaffJoinClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { token?: string };
}

export default async function StaffJoinPage({ searchParams }: PageProps) {
  const token = searchParams.token || '';
  const validation = await validateStaffInvitation(token);

  return (
    <StaffJoinClient
      token={token}
      isValid={validation.valid}
      companyName={validation.companyName || 'Synqo CRM'}
      errorMessage={validation.error}
    />
  );
}

