const JA_API = "https://ja.wikipedia.org/w/api.php";
// Wikipedia's API policy requires a descriptive User-Agent.
const UA = "HanashiteHakken/1.0 (Kochi cultural guide; contact via app)";

export type WikiResult = {
  title: string;
  extract: string;
  url: string;
};

type SearchResponse = {
  query?: { search?: { title: string }[] };
};

type ExtractResponse = {
  query?: {
    pages?: Record<
      string,
      { title: string; extract?: string; missing?: string }
    >;
  };
};

async function jfetch<T>(params: Record<string, string>): Promise<T | null> {
  const url = `${JA_API}?${new URLSearchParams({ format: "json", ...params }).toString()}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Api-User-Agent": UA },
      // Cache successful lookups for a day; facts about historical sites are stable.
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Look up a topic on Japanese Wikipedia: find the best-matching article and
 * return its intro extract. Returns null when nothing relevant is found.
 */
export async function searchWikipedia(query: string): Promise<WikiResult | null> {
  const q = query.trim();
  if (!q) return null;

  // 1) Find candidate article titles.
  const search = await jfetch<SearchResponse>({
    action: "query",
    list: "search",
    srsearch: q,
    srlimit: "3",
  });
  const hits = search?.query?.search ?? [];
  if (!hits.length) return null;

  // 2) Fetch the plain-text intro of the top hit (following redirects).
  const title = hits[0].title;
  const extract = await jfetch<ExtractResponse>({
    action: "query",
    prop: "extracts",
    // Include the lead plus the first sections (not just the intro) so
    // specific facts like founding years are available to the model.
    explaintext: "1",
    redirects: "1",
    titles: title,
  });
  const pages = extract?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined || !page.extract) return null;

  // Keep the context compact for the model while covering the first sections.
  const text = page.extract.replace(/\s+/g, " ").trim().slice(0, 1800);
  return {
    title: page.title,
    extract: text,
    url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
  };
}
