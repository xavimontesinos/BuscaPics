import type { ReactNode } from 'react';

type IconName =
  | 'camera'
  | 'chevronDown'
  | 'chevronUp'
  | 'layers'
  | 'location'
  | 'minus'
  | 'mountain'
  | 'plus';

type IconProps = {
  name: IconName;
};

const paths: Record<IconName, ReactNode> = {
  camera: <><path d="M14 4H8l-1.5 2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.5L16 4h-2Z" /><circle cx="12" cy="12.5" r="3.5" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  minus: <path d="M5 12h14" />,
  mountain: <><path d="m3 20 7-13 4 7 2-3 5 9H3Z" /><path d="m8 11 2 2 2-1" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
};

export function Icon({ name }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

