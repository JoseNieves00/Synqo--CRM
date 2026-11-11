import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { listCampaignsAction, listTagsAndSegmentsAction } from '@/app/actions/crm';
import { normalizeCustomerFilters, type CustomerFilters } from '@/lib/crm/customer-filters';
import { CampaignsClient } from '@/components/crm/CampaignsClient';

export const dynamic = 'force-dynamic';

export default async function CampanasPage({
  searchParams,
}: {
  searchParams?: { filters?: string };
}) {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    redirect('/login');
  }

  let initialFilters: CustomerFilters | null = null;
  if (searchParams?.filters) {
    try {
      initialFilters = normalizeCustomerFilters(JSON.parse(searchParams.filters));
    } catch {
      initialFilters = null;
    }
  }

  const [campaigns, meta] = await Promise.all([
    listCampaignsAction(),
    listTagsAndSegmentsAction(),
  ]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <CampaignsClient
        initialCampaigns={campaigns}
        meta={{
          tags: meta.tags,
          segments: meta.segments,
          whatsappProvider: meta.whatsappProvider,
          stageLabels: meta.stageLabels,
        }}
        initialFilters={initialFilters}
      />
    </div>
  );
}
