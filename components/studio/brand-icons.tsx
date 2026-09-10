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

/**
 * Фирменный оранжевый Boosty вместо обобщённой иконки — донат-кнопка должна
 * узнаваться с ходу. Буква «b» нарисована фигурами, а не <text>: текстовый
 * узел SVG иначе попадает в textContent ссылки и озвучивается скринридером
 * поверх настоящей подписи кнопки («b Boosty»).
 */
export function BoostyIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#F15F2C" />
      <rect x="8.4" y="5.5" width="2.4" height="13" rx="1.2" fill="#FFFFFF" />
      <circle cx="12.6" cy="14.3" r="3.3" fill="none" stroke="#FFFFFF" strokeWidth="2.4" />
    </svg>
  );
}

/** Фирменные два синих тона PayPal («PP»), нарисованные фигурами по той же причине, что и BoostyIcon. */
export function PaypalIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#003087" />
      <rect x="7.2" y="5.5" width="2.2" height="12" rx="1.1" fill="#009CDE" />
      <circle cx="10.9" cy="9.4" r="2.9" fill="none" stroke="#009CDE" strokeWidth="2.2" />
      <rect x="10.2" y="5.5" width="2.2" height="12" rx="1.1" fill="#FFFFFF" />
      <circle cx="13.9" cy="9.4" r="2.9" fill="none" stroke="#FFFFFF" strokeWidth="2.2" />
    </svg>
  );
}
