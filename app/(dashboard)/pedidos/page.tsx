import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { listOrdersAction } from '@/app/actions/crm';
import { OrdersManagerClient } from '@/components/orders/OrdersManagerClient';

export const dynamic = 'force-dynamic';

export default async function PedidosPage() {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    redirect('/login');
  }

  // Carga inicial de pedidos y estadísticas
  const { orders, stats } = await listOrdersAction();

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <OrdersManagerClient initialOrders={orders} initialStats={stats} />
    </div>
  );
}
