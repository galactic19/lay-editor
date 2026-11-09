export interface VideoProvider {
  id: string;
  /** Used as the iframe title (a product name, not translated). */
  title: string;
  idPattern: RegExp;
  /** Returns the video id if the URL belongs to this provider. */
  match(url: URL): string | null;
  embedUrl(id: string): string;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);
const YOUTUBE_PATH = /^\/(?:embed|shorts|live)\/([^/?#]+)/;
const VIMEO_PATH = /^\/(?:video\/)?(\d+)/;

const registry = new Map<string, VideoProvider>();

export function registerVideoProvider(provider: VideoProvider): void {
  registry.set(provider.id, provider);
}

export function getVideoProvider(id: string): VideoProvider | undefined {
  return registry.get(id);
}

export function registeredVideoProviders(): string[] {
  return [...registry.keys()];
}

registerVideoProvider({
  id: 'youtube',
  title: 'YouTube',
  idPattern: /^[\w-]{11}$/,
  match: (url) => {
    if (!YOUTUBE_HOSTS.has(url.hostname)) return null;
    if (url.hostname === 'youtu.be') return url.pathname.split('/')[1] ?? null;
    if (url.pathname === '/watch') return url.searchParams.get('v');
    return YOUTUBE_PATH.exec(url.pathname)?.[1] ?? null;
  },
  embedUrl: (id) => `https://www.youtube-nocookie.com/embed/${id}`,
});

registerVideoProvider({
  id: 'vimeo',
  title: 'Vimeo',
  idPattern: /^\d+$/,
  match: (url) => (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname) ? (VIMEO_PATH.exec(url.pathname)?.[1] ?? null) : null),
  embedUrl: (id) => `https://player.vimeo.com/video/${id}`,
});

/** Finds which allowed provider a URL belongs to; null for anything else. */
export function parseVideoUrl(input: string, allowed: readonly string[]): { provider: string; id: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  for (const providerId of allowed) {
    const provider = registry.get(providerId);
    const id = provider?.match(url);
    if (provider && id && provider.idPattern.test(id)) return { provider: providerId, id };
  }
  return null;
}
