import type { ReactNode } from 'react';

type MapViewportProps = {
  children: ReactNode;
};

export function MapViewport({ children }: MapViewportProps) {
  return (
    <main className="map-viewport" aria-label="Pantalla principal del mapa">
      <div className="map-placeholder" aria-hidden="true" />
      <div className="map-status" role="status">
        <span className="map-status__marker" aria-hidden="true" />
        Área del mapa · pendiente de implementar
      </div>
      {children}
    </main>
  );
}
