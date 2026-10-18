import { Icon } from './icons';

export function MapControls() {
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

      <div className="zoom-controls" role="group" aria-label="Controles de zoom provisionales">
        <button
          className="control-button zoom-button"
          type="button"
          disabled
          aria-label="Acercar, zoom pendiente de implementar"
          title="Acercar · pendiente"
        >
          <Icon name="plus" />
        </button>
        <button
          className="control-button zoom-button"
          type="button"
          disabled
          aria-label="Alejar, zoom pendiente de implementar"
          title="Alejar · pendiente"
        >
          <Icon name="minus" />
        </button>
      </div>
    </>
  );
}
