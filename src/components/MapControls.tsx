import { Icon } from './icons';
import { OrientationControl } from './OrientationControl';

type MapControlsProps = {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  bearing: number;
  onSetBearing?: (bearing: number) => void;
  onResetNorth?: () => void;
};

export function MapControls({
  onZoomIn,
  onZoomOut,
  bearing,
  onSetBearing,
  onResetNorth,
}: MapControlsProps) {
  return (
    <>
      <div className="top-controls" role="group" aria-label="Controles principales">
        <button
          className="control-button gps-button"
          type="button"
          disabled
          aria-label="Volver a la posición GPS, provisional"
          title="GPS · provisional"
        >
          <Icon name="location" />
          <span>GPS</span>
          <span className="provisional-tag">Pendiente</span>
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
        />
      </div>
    </>
  );
}
