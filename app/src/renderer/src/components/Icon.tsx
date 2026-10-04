// Small line icons drawn with the current text colour, so they stay visible in both themes.

const PATHS = {
  chart: 'M3 3v18h18M7 15l4-5 3 3 5-7',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5l12 7-12 7z',
  latest: 'M5 12h12M13 7l5 5-5 5M20 5v14'
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 15 }: { name: IconName; size?: number }): JSX.Element {
  return (
    <svg
      className="ico"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
