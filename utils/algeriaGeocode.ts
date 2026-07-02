export type AlgeriaAdmin = {
  commune: string;
  wilaya: string;
  daira: string;
};

function cleanAdminLabel(value: string, prefixes: RegExp[]): string {
  let out = value.trim();
  for (const prefix of prefixes) {
    out = out.replace(prefix, '').trim();
  }
  return out;
}

function cleanWilaya(value: string): string {
  return cleanAdminLabel(value, [/^Wilaya d['’]/i, /^Wilaya de /i, /^Province of /i, /^Province /i]);
}

function cleanDaira(value: string): string {
  return cleanAdminLabel(value, [/^Daira d['’]/i, /^Daïra d['’]/i, /^Daira de /i, /^Daïra de /i]);
}

function cleanCommune(value: string): string {
  return cleanAdminLabel(value, [/^Commune de /i, /^Commune d['’]/i]);
}

export function normalizeAlgeriaAdmin(commune: string, wilaya: string, daira: string): AlgeriaAdmin {
  return {
    commune: cleanCommune(commune),
    wilaya: cleanWilaya(wilaya),
    daira: cleanDaira(daira),
  };
}

export function parseAlgeriaAdminFromDisplayName(displayName: string): AlgeriaAdmin {
  const parts = displayName
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return { commune: '', wilaya: '', daira: '' };
  }

  const last = parts[parts.length - 1].toLowerCase();
  const withoutCountry =
    last.includes('algér') || last.includes('algeria') || last.includes('الجزائر')
      ? parts.slice(0, -1)
      : parts;

  if (withoutCountry.length === 1) {
    return normalizeAlgeriaAdmin('', withoutCountry[0], '');
  }

  if (withoutCountry.length === 2) {
    return normalizeAlgeriaAdmin(withoutCountry[0], withoutCountry[1], '');
  }

  return normalizeAlgeriaAdmin(
    withoutCountry[0],
    withoutCountry[withoutCountry.length - 1],
    withoutCountry.slice(1, -1).join(', '),
  );
}

export function mergeAlgeriaAdmin(...sources: Partial<AlgeriaAdmin>[]): AlgeriaAdmin {
  const out: AlgeriaAdmin = { commune: '', wilaya: '', daira: '' };
  for (const src of sources) {
    if (!src.commune && !src.wilaya && !src.daira) continue;
    if (!out.commune && src.commune) out.commune = src.commune;
    if (!out.wilaya && src.wilaya) out.wilaya = src.wilaya;
    if (!out.daira && src.daira) out.daira = src.daira;
  }
  return out;
}

export function parseAlgeriaAdminFromNominatim(
  addr: Record<string, string> | undefined,
  displayName?: string,
): AlgeriaAdmin {
  if (!addr) {
    return displayName ? parseAlgeriaAdminFromDisplayName(displayName) : { commune: '', wilaya: '', daira: '' };
  }

  const commune =
    addr.suburb ||
    addr.neighbourhood ||
    addr.quarter ||
    addr.city_district ||
    addr.municipality ||
    addr.town ||
    addr.village ||
    addr.hamlet ||
    addr.city ||
    '';

  const wilaya = addr.state || addr.region || addr.province || '';
  const daira = addr.county || addr.state_district || addr.district || '';

  const fromAddr = normalizeAlgeriaAdmin(commune, wilaya, daira);
  const fromName = displayName ? parseAlgeriaAdminFromDisplayName(displayName) : { commune: '', wilaya: '', daira: '' };

  let resolvedAddr = fromAddr;
  if (
    fromName.commune &&
    resolvedAddr.commune &&
    resolvedAddr.commune === resolvedAddr.wilaya &&
    fromName.commune !== resolvedAddr.commune
  ) {
    resolvedAddr = { ...resolvedAddr, commune: fromName.commune };
  }

  return mergeAlgeriaAdmin(resolvedAddr, fromName);
}

export type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

/** Parse Google Geocoder / Places address_components for Algeria admin divisions. */
export function parseAlgeriaAdminFromGoogleComponents(
  components: GoogleAddressComponent[] | undefined,
): AlgeriaAdmin {
  if (!components?.length) {
    return { commune: '', wilaya: '', daira: '' };
  }

  const get = (...types: string[]): string => {
    for (const type of types) {
      const match = components.find((c) => c.types.includes(type));
      if (match?.long_name) return match.long_name;
    }
    return '';
  };

  return normalizeAlgeriaAdmin(
    get(
      'sublocality',
      'sublocality_level_1',
      'neighborhood',
      'locality',
      'administrative_area_level_3',
      'postal_town',
    ),
    get('administrative_area_level_1'),
    get('administrative_area_level_2'),
  );
}

export const ALGERIA_BOUNDS = {
  south: 19.057441,
  north: 37.118381,
  west: -8.684399,
  east: 11.999506,
} as const;

export function isInAlgeriaBounds(lat: number, lon: number): boolean {
  return (
    lat >= ALGERIA_BOUNDS.south &&
    lat <= ALGERIA_BOUNDS.north &&
    lon >= ALGERIA_BOUNDS.west &&
    lon <= ALGERIA_BOUNDS.east
  );
}
