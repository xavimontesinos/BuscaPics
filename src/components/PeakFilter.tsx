import { useEffect, useId, useState } from 'react';
import type { PeakFilterId } from '../domain/peaks';
import { Icon } from './icons';

export type PeakSet = PeakFilterId;

type PeakOption = {
  value: PeakSet;
  label: string;
};

const peakOptions: PeakOption[] = [
  { value: 'over-3000m', label: 'Más de 3.000 m' },
  { value: 'feec-100-cims', label: 'Los 100 Cims de la FEEC' },
  { value: 'over-2500m', label: 'Más de 2.500 m' },
  { value: 'over-2000m', label: 'Más de 2.000 m' },
];

type PeakFilterProps = {
  value: PeakSet;
  onChange: (value: PeakSet) => void;
};

export function PeakFilter({ value, onChange }: PeakFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const selectedOption = peakOptions.find((option) => option.value === value);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  function selectOption(option: PeakOption) {
    onChange(option.value);
    setIsOpen(false);
  }

  return (
    <div className="peak-filter">
      <button
        className="control-button peak-filter__trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Icon name="mountain" />
        <span>Cimas</span>
        <span className="peak-filter__current">{selectedOption?.label}</span>
        <Icon name={isOpen ? 'chevronDown' : 'chevronUp'} />
      </button>

      {isOpen && (
        <div className="peak-menu" id={menuId} role="menu" aria-label="Filtrar cimas">
          <p className="peak-menu__heading">Conjunto de cimas</p>
          {peakOptions.map((option) => (
            <button
              className="peak-menu__option"
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              key={option.value}
              onClick={() => selectOption(option)}
            >
              <span>{option.label}</span>
              <span className="peak-menu__check" aria-hidden="true">
                {value === option.value ? '✓' : ''}
              </span>
            </button>
          ))}
          <p className="peak-menu__note">
            Muestra RTT de prueba · posiciones de cima pendientes de validar
          </p>
        </div>
      )}
    </div>
  );
}
