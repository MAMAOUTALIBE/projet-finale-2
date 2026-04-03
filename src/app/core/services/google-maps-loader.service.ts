import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

type GoogleMapsWindow = Window &
  typeof globalThis & {
    google?: typeof google;
  };

@Injectable({
  providedIn: 'root',
})
export class GoogleMapsLoaderService {
  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return Promise.reject(new Error('Google Maps ne peut être chargé que dans le navigateur.'));
    }

    const mapsWindow = window as GoogleMapsWindow;
    if (mapsWindow.google?.maps) {
      return Promise.resolve();
    }

    if (!environment.googleMapsApiKey) {
      return Promise.reject(new Error('La clé Google Maps n’est pas renseignée dans runtime-config.js.'));
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.getElementById('google-maps-script') as HTMLScriptElement | null;

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener(
          'error',
          () => {
            this.loadPromise = null;
            reject(new Error('Le script Google Maps a échoué au chargement.'));
          },
          { once: true }
        );
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.async = true;
      script.defer = true;
      script.src =
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(environment.googleMapsApiKey)}` +
        '&libraries=visualization';
      script.onload = () => resolve();
      script.onerror = () => {
        this.loadPromise = null;
        reject(new Error('Le script Google Maps a échoué au chargement.'));
      };

      document.head.appendChild(script);
    });

    return this.loadPromise;
  }
}
