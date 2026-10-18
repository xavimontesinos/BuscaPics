import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

type OrientationControlProps = {
  bearing: number;
  onSetBearing?: (bearing: number) => void;
  onResetNorth?: () => void;
};

type PointerDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  centerX: number;
  centerY: number;
  lastAngle: number;
  angularDelta: number;
  startBearing: number;
  isDragging: boolean;
};

const DRAG_THRESHOLD = 6;
const KEYBOARD_ROTATION_STEP = 15;
const DIRECTIONS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];

function normalizeBearing(bearing: number) {
  return ((bearing % 360) + 360) % 360;
}

function pointerAngle(clientX: number, clientY: number, centerX: number, centerY: number) {
  const angle = Math.atan2(clientX - centerX, centerY - clientY) * (180 / Math.PI);
  return normalizeBearing(angle);
}

function shortestAngleDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

function describeBearing(bearing: number) {
  const normalizedBearing = normalizeBearing(bearing);
  const roundedBearing = Math.round(normalizedBearing) % 360;
  const direction = DIRECTIONS[Math.round(normalizedBearing / 45) % DIRECTIONS.length];
  return `${roundedBearing}° (${direction})`;
}

export function OrientationControl({
  bearing,
  onSetBearing,
  onResetNorth,
}: OrientationControlProps) {
  const dragRef = useRef<PointerDrag | null>(null);
  const suppressPointerClickRef = useRef(false);
  const normalizedBearing = normalizeBearing(bearing);
  const accessibleBearing = describeBearing(bearing);

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;

    suppressPointerClickRef.current = false;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerX: bounds.left + bounds.width / 2,
      centerY: bounds.top + bounds.height / 2,
      lastAngle: pointerAngle(
        event.clientX,
        event.clientY,
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      ),
      angularDelta: 0,
      startBearing: bearing,
      isDragging: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const angle = pointerAngle(event.clientX, event.clientY, drag.centerX, drag.centerY);
    drag.angularDelta += shortestAngleDelta(drag.lastAngle, angle);
    drag.lastAngle = angle;

    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.isDragging && distance < DRAG_THRESHOLD) return;

    drag.isDragging = true;
    event.preventDefault();
    onSetBearing?.(normalizeBearing(drag.startBearing + drag.angularDelta));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    suppressPointerClickRef.current = drag.isDragging;
    dragRef.current = null;
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    suppressPointerClickRef.current = false;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!onSetBearing) return;

    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      onSetBearing(normalizeBearing(bearing + KEYBOARD_ROTATION_STEP));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      onSetBearing(normalizeBearing(bearing - KEYBOARD_ROTATION_STEP));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onResetNorth?.();
    }
  }

  return (
    <button
      className="control-button orientation-button"
      type="button"
      disabled={!onSetBearing || !onResetNorth}
      aria-label={`Orientación del mapa: ${accessibleBearing}. Pulsa para volver al norte.`}
      aria-describedby="orientation-control-hint"
      aria-keyshortcuts="ArrowUp ArrowRight ArrowDown ArrowLeft Home Enter Space"
      title={`Orientación ${accessibleBearing} · pulsar para norte`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        if (suppressPointerClickRef.current && event.detail > 0) {
          suppressPointerClickRef.current = false;
          event.preventDefault();
          return;
        }
        suppressPointerClickRef.current = false;
        onResetNorth?.();
      }}
    >
      <svg
        aria-hidden="true"
        className="orientation-button__compass"
        viewBox="0 0 24 24"
        style={{ transform: `rotate(${-normalizedBearing}deg)` }}
      >
        <circle cx="12" cy="12" r="9.25" />
        <path className="orientation-button__north" d="m12 4.5 3.1 9-3.1-1.8-3.1 1.8 3.1-9Z" />
        <path className="orientation-button__south" d="m12 19.5-3.1-9 3.1 1.8 3.1-1.8-3.1 9Z" />
      </svg>
      <span id="orientation-control-hint" className="visually-hidden">
        Arrastra para girar el mapa. Usa las flechas para girar en pasos de 15 grados y
        Inicio para volver al norte.
      </span>
    </button>
  );
}
