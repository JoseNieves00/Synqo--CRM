export interface CustomPaymentAccount {
  id: string;
  title: string; // Nombre del método o banco (100% libre: Nequi, Bancolombia, Zelle, Bizum, CLABE, etc.)
  accountNumber: string; // Número de cuenta, teléfono o identificador
  holderName: string; // Nombre completo del titular
  holderId?: string; // Documento de identidad, Cédula o NIT (opcional)
  instructions?: string; // Instrucciones adicionales para el cliente (opcional)
  paymentLink?: string; // Link de pago o pasarela directa (opcional)
  isActive: boolean; // Si está disponible para envío
}

export function formatPaymentAccountText(account: CustomPaymentAccount): string {
  let text = `💳 *Datos de Pago - ${account.title.trim()}*\n`;
  text += `• *Número / Cuenta:* ${account.accountNumber.trim()}\n`;
  text += `• *Titular:* ${account.holderName.trim()}\n`;
  if (account.holderId?.trim()) {
    text += `• *Documento / NIT:* ${account.holderId.trim()}\n`;
  }
  if (account.paymentLink?.trim()) {
    text += `• *Link de Pago:* ${account.paymentLink.trim()}\n`;
  }
  if (account.instructions?.trim()) {
    text += `• *Instrucciones:* ${account.instructions.trim()}\n`;
  } else {
    text += `• *Nota:* Por favor envía el comprobante por este chat para confirmar tu pedido.\n`;
  }
  return text.trim();
}

export function formatAllPaymentAccountsText(accounts: CustomPaymentAccount[]): string {
  const active = accounts.filter((a) => a.isActive);
  if (active.length === 0) return '';
  let text = `💳 *Métodos de Pago Disponibles:*\n\n`;
  active.forEach((acc, idx) => {
    text += `*${idx + 1}. ${acc.title.trim()}*\n`;
    text += `• Número / Cuenta: ${acc.accountNumber.trim()}\n`;
    text += `• Titular: ${acc.holderName.trim()}\n`;
    if (acc.holderId?.trim()) text += `• Documento / NIT: ${acc.holderId.trim()}\n`;
    if (acc.paymentLink?.trim()) text += `• Link: ${acc.paymentLink.trim()}\n`;
    if (acc.instructions?.trim()) text += `• Nota: ${acc.instructions.trim()}\n`;
    text += `\n`;
  });
  text += `Por favor envíanos tu comprobante por este chat una vez realizada la transferencia.`;
  return text.trim();
}

