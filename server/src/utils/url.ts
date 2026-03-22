const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'fbclid', 'gclid', 'gclsrc', 'dclid',
  'mc_cid', 'mc_eid', 'msclkid', 'twclid',
  '_ga', '_gl', '_hsenc', '_hsmi',
  'spm', 'from', 'isappinstalled', 'scene', 'clickid',
  'share_source', 'share_medium',
]);

export function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);

  // Normalize protocol
  url.protocol = url.protocol.toLowerCase();

  // Remove www prefix
  url.hostname = url.hostname.replace(/^www\./, '').toLowerCase();

  // Remove trailing slash (unless it's just the root)
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  // Remove tracking params
  const params = new URLSearchParams(url.searchParams);
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      params.delete(key);
    }
  }

  // Sort remaining params for consistency
  params.sort();

  // Remove hash/fragment
  url.hash = '';

  // Rebuild without trailing ?
  const search = params.toString();
  return `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}${url.pathname}${search ? '?' + search : ''}`;
}

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
