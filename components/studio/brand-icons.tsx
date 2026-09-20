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

/**
 * Значки площадок для окна «Поделиться». Фирменные цвета зашиты: на тёмном
 * фоне ряд одинаково бирюзовых кружков не читался бы как список мессенджеров.
 * Формы нарочно простые — в окне они живут размером 26px.
 */
export function TelegramIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#2AABEE" />
      <path d="M6 12.2 17 7.6l-1.8 9.6-3.2-2.4-1.7 1.6-.3-2.9Z" fill="#FFFFFF" />
      <path d="M10 13.5 15.6 9l-4.5 5.4Z" fill="#C8E6F8" />
    </svg>
  );
}

export function WhatsappIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#25D366" />
      <path d="M9.3 7.6c.4 0 .6.2.8.6l.6 1.4c.1.3.1.5-.1.8l-.5.6c-.2.2-.2.4 0 .7.7 1.1 1.5 1.9 2.6 2.5.3.2.5.1.7-.1l.6-.6c.2-.2.5-.3.8-.2l1.4.6c.4.2.5.4.5.8 0 1.2-1 2-2.2 1.9-3.3-.3-6.2-3.2-6.5-6.5-.1-1.2.8-2.2 1.9-2.2Z" fill="#FFFFFF" />
    </svg>
  );
}

export function VkIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#0077FF" />
      <path d="M6 9h2c.2 1.8.9 3 1.7 3.6V9h1.9v2.7c.9-.2 1.6-1.2 1.9-2.7H15c-.2 1.4-.8 2.5-1.6 3.1 1 .6 1.7 1.6 2 2.9h-2c-.3-1-.9-1.7-1.8-1.9V15H9.4C7.5 14.6 6.2 12.4 6 9Z" fill="#FFFFFF" />
    </svg>
  );
}

export function FacebookIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#1877F2" />
      <path d="M13.9 12.4h1.8l.3-2.3h-2.1V8.7c0-.7.2-1.1 1.1-1.1h1.1V5.6c-.2 0-.9-.1-1.7-.1-1.7 0-2.9 1-2.9 3v1.6H9.5v2.3h2v6h2.4Z" fill="#FFFFFF" />
    </svg>
  );
}

export function XIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#0F0F10" />
      <path d="M7 6.5h2.6l2.6 3.5 3-3.5h1.6l-3.9 4.5 4.1 5.5h-2.6l-2.8-3.7-3.2 3.7H6.8l4.1-4.8Z" fill="#FFFFFF" />
    </svg>
  );
}

export function MailIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#4A4E57" />
      <path d="M5.5 8.5h13v7h-13Z" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m5.5 9 6.5 4.2L18.5 9" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
