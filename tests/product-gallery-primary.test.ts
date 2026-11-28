import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupGalleryIntoProducts,
  setPrimaryPhotoInGallery,
  findGalleryProductMatch,
  resolveOrganizationGallery,
} from '../lib/ai/product-gallery';
import type { GalleryPhotoItem } from '../lib/media/format';

test('1. setPrimaryPhotoInGallery promueve la foto elegida como principal, la reordena de primera y actualiza flags', () => {
  const gallery: GalleryPhotoItem[] = [
    {
      id: 'photo-1',
      name: 'Casita de Ensueños',
      productName: 'Casita de Ensueños',
      url: 'https://example.com/casita-1.jpg',
      price: '630000',
      description: 'Casita de madera 1.10m',
      isAvailable: true,
      isHero: true,
      imageRole: 'principal',
    },
    {
      id: 'photo-2',
      name: 'Cocina Chef',
      productName: 'Cocina Chef',
      url: 'https://example.com/cocina-1.jpg',
      price: '410000',
      isHero: true,
      imageRole: 'principal',
    },
    {
      id: 'photo-3',
      name: 'Casita de Ensueños',
      productName: 'Casita de Ensueños',
      url: 'https://example.com/casita-2.jpg',
      price: '630000',
      isHero: false,
      imageRole: 'alterna',
    },
  ];

  const updated = setPrimaryPhotoInGallery(gallery, 'photo-3');

  // En el arreglo plano, photo-3 debe quedar de primera en su grupo (índice 0)
  assert.equal(updated[0].id, 'photo-3', 'La foto promovida debe quedar de primera en su grupo en el arreglo plano');
  assert.equal(updated[0].isHero, true);
  assert.equal(updated[0].imageRole, 'principal');

  // La antigua portada (photo-1) debe quedar como alterna y no hero
  const oldHero = updated.find((p) => p.id === 'photo-1')!;
  assert.equal(oldHero.isHero, false);
  assert.equal(oldHero.imageRole, 'alterna');

  // El otro producto (Cocina Chef) no debe verse afectado
  const otherProd = updated.find((p) => p.id === 'photo-2')!;
  assert.equal(otherProd.isHero, true);
  assert.equal(otherProd.imageRole, 'principal');

  // groupGalleryIntoProducts debe reflejar photo-3 como primaryPhoto y preservar description/isAvailable
  const grouped = groupGalleryIntoProducts(updated);
  const casitaGroup = grouped.find((g) => g.productName === 'Casita de Ensueños')!;
  assert.equal(casitaGroup.primaryPhoto.id, 'photo-3');
  assert.equal(casitaGroup.allPhotos[0].id, 'photo-3');
  assert.equal(casitaGroup.description, 'Casita de madera 1.10m');
  assert.equal(casitaGroup.isAvailable, true);

  // findGalleryProductMatch sin image_role debe devolver la nueva foto principal primero
  const resolved = resolveOrganizationGallery({ structured_prompt_data: { gallery: updated } });
  const matched = findGalleryProductMatch(resolved.items, 'Casita de Ensueños');
  assert.equal(matched?.id, 'photo-3', 'La IA debe seleccionar la nueva foto principal por defecto');
});

test('2. setPrimaryPhotoInGallery funciona también con fallback por URL si falta id', () => {
  const gallery: GalleryPhotoItem[] = [
    {
      id: 'p1',
      name: 'Producto A',
      productName: 'Producto A',
      url: 'https://example.com/a1.jpg',
      isHero: true,
      imageRole: 'principal',
    },
    {
      id: '',
      name: 'Producto A',
      productName: 'Producto A',
      url: 'https://example.com/a2.jpg',
      isHero: false,
      imageRole: 'de lado',
    },
  ];

  const updated = setPrimaryPhotoInGallery(gallery, 'https://example.com/a2.jpg');
  assert.equal(updated[0].url, 'https://example.com/a2.jpg');
  assert.equal(updated[0].isHero, true);
  assert.equal(updated[1].isHero, false);
});
