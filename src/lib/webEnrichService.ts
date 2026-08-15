/**
 * Service for fetching product data from web sources:
 * - Open Food Facts API (by EAN / barcode)
 * - DuckDuckGo / Search engines (HTML / snippet scraping)
 * - Direct URL scraping with HTML cleaning
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebEnrichRawData {
  sources: string[];
  textContent: string;
  eanData?: Record<string, any> | null;
}

/**
 * Strips HTML tags, script, style, and navigation noise to retain meaningful textual content
 */
export function cleanHtmlToText(html: string, maxLength: number = 6000): string {
  if (!html) return '';

  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength) + '... [tekst ingekort]';
  }

  return cleaned;
}

/**
 * Fetches product metadata from Open Food Facts if a barcode/EAN is available
 */
export async function lookupEanData(ean: string): Promise<Record<string, any> | null> {
  const cleanEan = ean.replace(/\D/g, '');
  if (!cleanEan || cleanEan.length < 8) return null;

  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanEan)}.json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'e-co.store - ProductEnrichment/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 1 && data.product) {
      const p = data.product;
      return {
        source: 'OpenFoodFacts',
        productName: p.product_name || p.product_name_nl || p.product_name_en,
        brands: p.brands,
        quantity: p.quantity,
        netWeight: p.net_weight_value ? `${p.net_weight_value} ${p.net_weight_unit || 'g'}` : undefined,
        packaging: p.packaging_text || p.packaging,
        packagingMaterials: p.packaging_materials_tags,
        ingredients: p.ingredients_text_nl || p.ingredients_text || p.ingredients_text_en,
        allergens: p.allergens_tags || p.allergens,
        categories: p.categories,
        labels: p.labels,
      };
    }
  } catch (e) {
    console.warn('[webEnrich] OpenFoodFacts lookup error:', e);
  }
  return null;
}

/**
 * Fetches content from a direct URL (e.g. manufacturer or shop page)
 */
export async function fetchPageContent(targetUrl: string): Promise<string> {
  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';

    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return '';
    const html = await res.text();
    return cleanHtmlToText(html, 6000);
  } catch (e) {
    console.warn(`[webEnrich] Failed to fetch page ${targetUrl}:`, e);
    return '';
  }
}

/**
 * Searches the web for product information using DuckDuckGo HTML search
 */
export async function searchWebProduct(query: string): Promise<WebSearchResult[]> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) return [];
    const html = await res.text();

    const results: WebSearchResult[] = [];
    const regex = /<a[^>]*class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = regex.exec(html)) !== null && results.length < 4) {
      const rawUrl = match[1];
      let directUrl = rawUrl;
      try {
        if (rawUrl.includes('uddg=')) {
          const u = new URL('https://duckduckgo.com' + rawUrl);
          directUrl = decodeURIComponent(u.searchParams.get('uddg') || rawUrl);
        }
      } catch { /**/ }

      results.push({
        url: directUrl,
        title: cleanHtmlToText(match[2], 150),
        snippet: cleanHtmlToText(match[3], 300),
      });
    }

    return results;
  } catch (e) {
    console.warn('[webEnrich] DuckDuckGo search error:', e);
    return [];
  }
}

/**
 * Aggregates web data from all available sources (EAN lookup, Web search, Direct URL)
 */
export async function aggregateProductWebData(params: {
  title?: string;
  brand?: string;
  ean?: string;
  price?: string | number;
  customUrl?: string;
}): Promise<WebEnrichRawData> {
  const sources: string[] = [];
  const textParts: string[] = [];
  let eanData: Record<string, any> | null = null;

  // 1. Direct URL (if provided by user)
  if (params.customUrl?.trim()) {
    const pageText = await fetchPageContent(params.customUrl.trim());
    if (pageText) {
      sources.push(params.customUrl.trim());
      textParts.push(`--- Pagina-inhoud van ${params.customUrl.trim()} ---\n${pageText}`);
    }
  }

  // 2. OpenFoodFacts EAN lookup
  if (params.ean?.trim()) {
    eanData = await lookupEanData(params.ean.trim());
    if (eanData) {
      sources.push(`Open Food Facts (EAN: ${params.ean.trim()})`);
      textParts.push(`--- Open Food Facts Database ---\n${JSON.stringify(eanData, null, 2)}`);
    }
  }

  // 3. Web Search
  const queryTerms = [
    params.brand?.trim(),
    params.title?.trim(),
    params.ean?.trim(),
  ].filter(Boolean).join(' ');

  if (queryTerms.length > 2) {
    const searchResults = await searchWebProduct(queryTerms);
    if (searchResults.length > 0) {
      const searchSnippets = searchResults.map(r => `Titel: ${r.title}\nBron: ${r.url}\nFragment: ${r.snippet}`).join('\n\n');
      sources.push(...searchResults.map(r => r.url));
      textParts.push(`--- Zoekresultaten web (${queryTerms}) ---\n${searchSnippets}`);

      // If we don't have enough content yet and got good URLs, fetch top 1 result
      if (textParts.length < 2 && searchResults[0]?.url && !searchResults[0].url.includes('duckduckgo.com')) {
        const topPage = await fetchPageContent(searchResults[0].url);
        if (topPage) {
          textParts.push(`--- Diepere pagina-inhoud van top zoekresultaat (${searchResults[0].url}) ---\n${topPage}`);
        }
      }
    }
  }

  return {
    sources: Array.from(new Set(sources)),
    textContent: textParts.join('\n\n'),
    eanData,
  };
}
