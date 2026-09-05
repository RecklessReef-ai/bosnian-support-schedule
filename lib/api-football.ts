const BASE_URL = "https://v3.football.api-sports.io";

/**
 * ~50 distinct clubs x 1 call per refresh. At 24h that is ~50 of the free tier's
 * 100 daily calls, leaving headroom for an occasional `npm run refresh:roster`.
 */
export const FIXTURES_TTL_SECONDS = 60 * 60 * 24;

export function hasApiKey(): boolean {
  return Boolean(process.env.API_FOOTBALL_KEY);
}

interface ApiFootballResponse<T> {
  response: T;
  errors: unknown;
}

async function request<T>(
  path: string,
  params: Record<string, string | number>,
  revalidate: number,
): Promise<T> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not set");

  const url = new URL(`${BASE_URL}/${path}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }

  const res = await fetch(url, {
    headers: { "x-apisports-key": key },
    next: { revalidate },
  });

  if (!res.ok) {
    throw new Error(`API-Football ${path} failed: ${res.status}`);
  }

  const body = (await res.json()) as ApiFootballResponse<T>;

  // API-Football returns 200 with a populated `errors` field for quota and auth problems.
  if (body.errors && !Array.isArray(body.errors) && Object.keys(body.errors).length > 0) {
    throw new Error(`API-Football ${path} error: ${JSON.stringify(body.errors)}`);
  }

  return body.response;
}

export interface RawFixture {
  fixture: {
    id: number;
    date: string;
    venue: { name: string | null } | null;
  };
  league: { name: string; logo: string | null; round: string | null };
  teams: {
    home: { id: number; name: string; logo: string | null };
    away: { id: number; name: string; logo: string | null };
  };
}

export async function getUpcomingFixtures(
  teamId: number,
  count: number,
): Promise<RawFixture[]> {
  return request<RawFixture[]>(
    "fixtures",
    { team: teamId, next: count },
    FIXTURES_TTL_SECONDS,
  );
}
