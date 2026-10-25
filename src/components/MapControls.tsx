import { Icon } from './icons';
import { OrientationControl } from './OrientationControl';
import type { ObservationOrientationMode } from '../domain/orientation';

type MapControlsProps = {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  bearing: number;
  onSetBearing?: (bearing: number) => void;
  onResetNorth?: () => void;
  orientationMode?: ObservationOrientationMode;
  compassAvailable?: boolean;
  gpsTracking?: boolean;
  gpsStatus?: string;
  gpsMessage?: string | null;
  onGpsToggle?: () => void;
  onManualObserver?: () => void;
  compassStatus?: string | null;
};

export function MapControls({
  onZoomIn,
  onZoomOut,
  bearing,
  onSetBearing,
  onResetNorth,
  orientationMode,
  compassAvailable,
  gpsTracking = false,
  gpsStatus = 'idle',
  gpsMessage = null,
  onGpsToggle,
  onManualObserver,
  compassStatus = null,
}: MapControlsProps) {
  return (
    <>
      <div className="top-controls" role="group" aria-label="Controles principales">
        <button
          className="control-button gps-button"
          type="button"
          disabled={!onGpsToggle}
          onClick={onGpsToggle}
          aria-label={gpsTracking ? 'Detener seguimiento GPS' : 'Activar seguimiento GPS'}
          title={gpsTracking ? 'Detener GPS' : 'Seguir posición GPS'}
        >
          <Icon name="location" />
          <span>{gpsTracking ? 'Detener GPS' : 'GPS'}</span>
          {gpsStatus !== 'idle' && <span className="gps-state-tag">{gpsStatus}</span>}
        </button>

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

      {(gpsMessage || compassStatus) && (
        <div className="sensor-status" role="status" aria-live="polite">
          {gpsMessage && <p>{gpsMessage}</p>}
          {compassStatus && <p>{compassStatus}</p>}
          {gpsStatus !== 'idle' && onManualObserver && (
            <button className="sensor-status__manual" type="button" onClick={onManualObserver}>
              Detener GPS y elegir posición manual
            </button>
          )}
        </div>
      )}

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
        <OrientationControl
          bearing={bearing}
          onSetBearing={onSetBearing}
          onResetNorth={onResetNorth}
          orientationMode={orientationMode}
          compassAvailable={compassAvailable}
        />
      </div>
    </>
  );
}
