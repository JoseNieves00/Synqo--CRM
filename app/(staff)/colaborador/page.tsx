import { getStaffSession } from '@/app/actions/staff';
import { StaffMobileApp } from '@/components/staff/StaffMobileApp';

export const dynamic = 'force-dynamic';

export default async function ColaboradorPage() {
  const session = await getStaffSession();

  return <StaffMobileApp initialSession={session} />;
}

