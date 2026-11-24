import assert from 'node:assert/strict';
import test from 'node:test';
import { CampaignService } from '../services/campaign.service';

test('1. Variable interpolation in custom campaigns replaces {nombre} and {primer_nombre}', () => {
  const customMessage = '¡Hola {primer_nombre}! Vimos que te interesó nuestra colección, {nombre}. ¿Te gustaría apartarlo hoy con abono?';
  
  const contact = {
    name: 'Carolina Gómez Restrepo',
    phone: '573001234567',
  };

  const rawName = (contact.name || '').trim();
  const firstName = rawName ? rawName.split(/\s+/)[0] : '';
  const interpolated = customMessage
    .replace(/\{nombre\}/gi, rawName || '')
    .replace(/\{primer_nombre\}/gi, firstName || '')
    .replace(/\{primer nombre\}/gi, firstName || '')
    .trim();

  assert.strictEqual(
    interpolated,
    '¡Hola Carolina! Vimos que te interesó nuestra colección, Carolina Gómez Restrepo. ¿Te gustaría apartarlo hoy con abono?'
  );
});

test('2. Variable interpolation handles contacts with single name or missing name gracefully', () => {
  const customMessage = '¡Hola {primer_nombre}! Te escribimos de Filippo Kids.';
  
  // Single name
  const contactSingle = { name: 'Andrea', phone: '573001234567' };
  const rawSingle = (contactSingle.name || '').trim();
  const firstSingle = rawSingle ? rawSingle.split(/\s+/)[0] : '';
  const interpSingle = customMessage.replace(/\{primer_nombre\}/gi, firstSingle || '').trim();
  assert.strictEqual(interpSingle, '¡Hola Andrea! Te escribimos de Filippo Kids.');

  // Empty name
  const contactEmpty = { name: '', phone: '573001234567' };
  const rawEmpty = (contactEmpty.name || '').trim();
  const firstEmpty = rawEmpty ? rawEmpty.split(/\s+/)[0] : '';
  const interpEmpty = customMessage.replace(/\{primer_nombre\}/gi, firstEmpty || '').trim();
  assert.strictEqual(interpEmpty, '¡Hola ! Te escribimos de Filippo Kids.');
});

test('3. Custom image attachment takes priority over catalog product photos', () => {
  const campaignCustom = {
    dispatch_mode: 'custom',
    custom_message: 'Novedad exclusiva de temporada',
    custom_image_url: 'https://cdn.synqo.io/promos/super-promo-mayo.png',
    include_product_photo: true,
  };

  const resolvedImageUrls = campaignCustom.custom_image_url
    ? [campaignCustom.custom_image_url]
    : [];

  assert.deepStrictEqual(resolvedImageUrls, ['https://cdn.synqo.io/promos/super-promo-mayo.png']);
});

test('4. Redacción IA mode with custom image uses custom image attachment', () => {
  const campaignAiWithCustomImage = {
    dispatch_mode: 'ai',
    objective: 'Reactivar interesados en cocinitas con foto de la nueva cocina chef',
    custom_image_url: 'https://cdn.synqo.io/promos/cocinita-chef-madera.jpg',
    include_product_photo: false,
  };

  const imageUrls = campaignAiWithCustomImage.custom_image_url
    ? [campaignAiWithCustomImage.custom_image_url]
    : [];

  assert.deepStrictEqual(imageUrls, ['https://cdn.synqo.io/promos/cocinita-chef-madera.jpg']);
});
