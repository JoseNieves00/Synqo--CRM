'use client';

/**
 * Comprime y redimensiona una imagen en el navegador del cliente antes de subirla al storage.
 * - Limita dimensiones máximas a 1200x1200px manteniendo el ratio de aspecto.
 * - Convierte a JPEG/WebP optimizado (calidad 82%).
 * - Reduce archivos pesados de 8MB a menos de 400KB para carga instantánea en WhatsApp.
 */
export async function compressImageClient(
  file: File,
  maxDimension = 1200,
  quality = 0.82
): Promise<File> {
  // Si no es imagen o ya es menor a 250KB y es formato ligero, retornar sin tocar
  if (!file.type.startsWith('image/') || file.size < 250 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calcular escalado proporcional si supera maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file); // Fallback al archivo original si el canvas falla
          return;
        }

        // Fondo blanco para imágenes transparentes que se conviertan a JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Elegir formato ligero de salida (image/jpeg tiene compatibilidad universal en WhatsApp)
        const outputMime = 'image/jpeg';
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file); // Si la compresión no ahorró peso, conservar original
              return;
            }

            const cleanName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
            const compressedFile = new File([blob], cleanName, {
              type: outputMime,
              lastModified: Date.now(),
            });

            resolve(compressedFile);
          },
          outputMime,
          quality
        );
      };

      img.onerror = () => resolve(file);
      img.src = readerEvent.target?.result as string;
    };

    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}
