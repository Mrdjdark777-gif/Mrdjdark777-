type IconProps = { size?: number; className?: string };

/**
 * Значок площадки, который сразу узнаётся, вместо обобщённой иконки из
 * lucide (видеокамера не читается как «YouTube»). Нарисован в том же
 * штриховом стиле, что и остальные иконки lucide, — тем же currentColor,
 * поэтому подчиняется общей раскраске и подсветке при нажатии.
 */
export function YoutubeIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="6" width="20" height="12" rx="4" />
      <path d="M10 9.3 16 12 10 14.7Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
