import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { listOrdersAction } from '@/app/actions/crm';
import { getOrganizationShippingSettings } from '@/app/actions/settings';
import { OrdersManagerClient } from '@/components/orders/OrdersManagerClient';

export const dynamic = 'force-dynamic';

export default async function PedidosPage() {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    redirect('/login');
  }

  // Carga inicial de pedidos, estadísticas y transportadoras configuradas en Políticas de Envío
  const [{ orders, stats }, shippingSettings] = await Promise.all([
    listOrdersAction().catch((err) => {
      console.error('[PedidosPage] Error cargando pedidos iniciales:', err);
      return {
        orders: [],
        stats: {
          totalRevenue: 0,
          totalOrders: 0,
          pendingValidation: 0,
          confirmedToShip: 0,
          paid: 0,
          shipped: 0,
          delivered: 0,
          cancelled: 0,
        },
      };
    }),
    getOrganizationShippingSettings().catch(() => null),
  ]);
  const shippingCarriers = String(shippingSettings?.carrierNames || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <OrdersManagerClient
        initialOrders={orders}
        initialStats={stats}
        shippingCarriers={shippingCarriers}
      />
    </div>
  );
}
