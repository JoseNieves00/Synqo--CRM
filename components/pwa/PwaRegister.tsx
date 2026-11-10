'use client';

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then(() => {
            // Service worker listo para PWA
          })
          .catch((error) => {
            console.debug('[PWA] SW register skipped:', error);
          });
      });
    }
  }, []);

  return null;
}
