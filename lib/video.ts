// Разбор ссылок на видео и соцсети. Используется и на сервере (проверка того,
// что сохраняет автор), и на клиенте (что показать в плеере), поэтому здесь
// нет ни браузерных, ни серверных зависимостей.

export type VideoKind = 'youtube' | 'rutube' | 'vk' | 'tiktok' | 'file' | 'link';
export type Video = { kind: VideoKind; embed: string; watch: string; tall: boolean };

const FILE = /\.(mp4|webm|ogv|ogg|m4v|mov)$/i;
const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;

/** Возвращает null только если ссылка вообще не годится (не HTTPS или не URL). */
export function parseVideo(raw: string): Video | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  let u: URL;
  try { u = new URL(value); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const host = u.hostname.replace(/^(www|m)\./, '').toLowerCase(), path = u.pathname, watch = u.toString();
  const link = (kind: VideoKind, embed: string, tall = false): Video => ({ kind, embed, watch, tall });
  const yt = (id: string) => link('youtube', `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`);

  if (host === 'youtu.be') { const id = path.slice(1).split('/')[0]; if (YT_ID.test(id)) return yt(id); }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v'); if (v && YT_ID.test(v)) return yt(v);
    const m = /^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(path); if (m && YT_ID.test(m[1])) return yt(m[1]);
  }
  if (host === 'rutube.ru') { const m = /^\/(?:video|shorts|play\/embed)\/([0-9a-f]{8,64})/i.exec(path); if (m) return link('rutube', `https://rutube.ru/play/embed/${m[1]}`); }
  if (host === 'vk.com' || host === 'vkvideo.ru') { const m = /^\/(video|clip)(-?\d{1,19})_(\d{1,19})/.exec(path); if (m) return link('vk', `https://vk.com/video_ext.php?oid=${m[2]}&id=${m[3]}&hd=2&js=1`, m[1] === 'clip'); }
  if (host === 'tiktok.com') { const m = /\/video\/(\d{6,25})/.exec(path); if (m) return link('tiktok', `https://www.tiktok.com/embed/v2/${m[1]}`, true); }
  if (FILE.test(path)) return link('file', watch);
  // Всё остальное (короткие ссылки, Instagram, Dzen…) открывается на площадке.
  return link('link', '');
}

export const SOCIALS = [
  { kind: 'youtube', labelKey: 'social.youtube' },
  { kind: 'tiktok', labelKey: 'social.tiktok' },
  { kind: 'instagram', labelKey: 'social.instagram' },
  { kind: 'telegram', labelKey: 'social.telegram' },
  { kind: 'vk', labelKey: 'social.vk' },
  { kind: 'site', labelKey: 'social.site' },
] as const;
export type SocialKind = (typeof SOCIALS)[number]['kind'];
export type SocialLink = { kind: SocialKind; url: string };

export const DONATIONS = [
  { kind: 'boosty', labelKey: 'donate.boosty' },
  { kind: 'paypal', labelKey: 'donate.paypal' },
] as const;
export type DonationKind = (typeof DONATIONS)[number]['kind'];
export type DonationLink = { kind: DonationKind; url: string };

/** Общий разбор списка «площадка → ссылка»: HTTPS, без логина/пароля в URL, только известные ключи. */
function parseKindUrlList<K extends string>(raw: string, kinds: readonly K[]): { kind: K; url: string }[] {
  let list: unknown;
  try { list = JSON.parse(raw || '[]'); } catch { return []; }
  if (!Array.isArray(list)) return [];
  return list.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const { kind, url } = item as Record<string, unknown>;
    if (typeof kind !== 'string' || typeof url !== 'string' || !(kinds as readonly string[]).includes(kind)) return [];
    const value = url.trim();
    if (!value) return [];
    try { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password) return []; } catch { return []; }
    return [{ kind: kind as K, url: value }];
  }).slice(0, 8);
}

export function parseLinks(raw: string): SocialLink[] {
  return parseKindUrlList(raw, SOCIALS.map(s => s.kind));
}

export function parseDonations(raw: string): DonationLink[] {
  return parseKindUrlList(raw, DONATIONS.map(d => d.kind));
}
