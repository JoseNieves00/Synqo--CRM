export const TAG_COLORS = [
  'slate',
  'blue',
  'emerald',
  'amber',
  'rose',
  'violet',
  'cyan',
  'orange',
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export type OrderStatus = 'pending' | 'confirmed' | 'paid' | 'delivered' | 'cancelled';

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'paid',
  'delivered',
  'cancelled',
];
