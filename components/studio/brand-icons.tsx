type IconProps = { size?: number; className?: string };

/**
 * Значок площадки, который сразу узнаётся, вместо обобщённой иконки из
 * lucide (видеокамера не читается как «YouTube»). Цвет фиксированный —
 * фирменный красный YouTube, а не currentColor: иначе иконка красилась бы
 * в бирюзовый цвет темы и при нажатии, как остальные chip-иконки.
 */
export function YoutubeIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <rect x="1.5" y="5" width="21" height="14" rx="5" fill="#FF0000" />
      <path d="M10 8.8 16.2 12 10 15.2Z" fill="#FFFFFF" />
    </svg>
  );
}
