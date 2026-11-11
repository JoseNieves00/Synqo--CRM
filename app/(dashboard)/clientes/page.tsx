import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { listCustomersAction, listTagsAndSegmentsAction } from '@/app/actions/crm';
import type { CustomerSort } from '@/lib/crm/customer-filters';
import { CustomersDirectoryClient } from '@/components/crm/CustomersDirectoryClient';

export const dynamic = 'force-dynamic';

export default async function ClientesPage({
  searchParams,
}: {
  searchParams?: { contact?: string; sort?: string };
}) {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    redirect('/login');
  }

  const rawSort = searchParams?.sort;
  const initialSort: CustomerSort =
    rawSort === 'recent' || rawSort === 'name' || rawSort === 'created' || rawSort === 'score'
      ? rawSort
      : rawSort === 'score_desc'
        ? 'score'
        : 'score';

  const [initialData, initialMeta] = await Promise.all([
    listCustomersAction({ filters: {}, sort: initialSort, page: 1, pageSize: 25 }),
    listTagsAndSegmentsAction(),
  ]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <CustomersDirectoryClient
        initialData={initialData}
        initialMeta={initialMeta}
        initialContactId={searchParams?.contact || null}
        initialSort={initialSort}
      />
    </div>
  );
}
