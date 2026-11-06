import { Icon } from './icons';
import type { ObservationOrientationMode } from '../domain/orientation';
import type { CSSProperties } from 'react';
import { getContextButtonKind } from '../domain/observerCameraState';

type MapControlsProps = {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  bearing: number;
  orientationMode: ObservationOrientationMode;
  compassAvailable: boolean;
  gpsAvailable: boolean;
  onContextAction: () => void;
};

export function MapControls({
  onZoomIn,
  onZoomOut,
  bearing,
  orientationMode,
  compassAvailable,
  gpsAvailable,
  onContextAction,
}: MapControlsProps) {
  const buttonKind = getContextButtonKind(orientationMode);
  return (
    <>
      <div className="top-controls">
        <div className="top-controls__right">
          <button
            className="control-button top-action"
            type="button"
            disabled
            aria-label="Gestión de mapas descargados, provisional"
            title="Gestión de mapas · pendiente"
          >
            <Icon name="layers" />
            <span>Mapas</span>
          </button>
          <button
            className="control-button top-action camera-button"
            type="button"
            disabled
            aria-label="Modo cámara, próximamente. Cámara deshabilitada"
            title="Próximamente"
          >
            <Icon name="camera" />
            <span>Cámara</span>
            <span className="provisional-tag">Próximamente</span>
          </button>
        </div>
      </div>
      <div className="map-navigation-controls">
        <div className="zoom-controls" role="group" aria-label="Controles de zoom">
          <button
            className="control-button zoom-button"
            type="button"
            disabled={!onZoomIn}
            onClick={onZoomIn}
            aria-label="Acercar mapa"
            title="Acercar"
          >
            <Icon name="plus" />
          </button>
          <button
            className="control-button zoom-button"
            type="button"
            disabled={!onZoomOut}
            onClick={onZoomOut}
            aria-label="Alejar mapa"
            title="Alejar"
          >
            <Icon name="minus" />
          </button>
        </div>
        <button
          className="control-button orientation-button"
          type="button"
          disabled={buttonKind === 'target' && !gpsAvailable}
          onClick={onContextAction}
          aria-label={buttonKind === 'target'
            ? 'Volver a la posición GPS'
            : orientationMode === 'compass'
              ? 'Desactivar brújula y orientar al norte'
              : 'Activar brújula del teléfono'}
          title={buttonKind === 'target'
            ? 'Volver al GPS'
            : orientationMode === 'compass'
              ? 'Norte arriba'
              : 'Orientación por brújula'}
          style={{ '--compass-rotation': `${orientationMode === 'compass' && compassAvailable ? bearing : 0}deg` } as CSSProperties}
        >
          {buttonKind === 'target' ? <Icon name="myLocation" /> : <Icon name="explore" />}
        </button>
      </div>
    </>
  );
}
