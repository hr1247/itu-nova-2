import { createSourceProvenance, evaluateSourceTrust } from './sourceTrustService.js';

/**
 * Fetches real-time weather directly from Open-Meteo API for Lahore.
 */
async function fetchLiveWeather() {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=31.5497&longitude=74.3436&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const data = await res.json();
      const temp = data?.current?.temperature_2m;
      const humidity = data?.current?.relative_humidity_2m;
      const wind = data?.current?.wind_speed_10m;
      return `LIVE LAHORE WEATHER RIGHT NOW: Temperature is ${temp}°C, Relative Humidity is ${humidity}%, Wind speed is ${wind} km/h.`;
    }
  } catch (err) {
    console.warn('[WebSearch] Open-Meteo error:', err.message);
  }
  return null;
}

/**
 * Fetches real-time currency exchange rates from Open Exchange Rates API.
 */
async function fetchLiveForex() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      const pkr = data?.rates?.PKR?.toFixed(2);
      const aed = data?.rates?.AED?.toFixed(2);
      const sar = data?.rates?.SAR?.toFixed(2);
      const eur = (data?.rates?.PKR / data?.rates?.EUR)?.toFixed(2);
      return `LIVE CURRENCY EXCHANGE RATES TODAY: 1 USD = ${pkr} PKR | 1 EUR = ~${eur} PKR | 1 AED = ~${(data?.rates?.PKR / aed)?.toFixed(2)} PKR | 1 SAR = ~${(data?.rates?.PKR / sar)?.toFixed(2)} PKR.`;
    }
  } catch (err) {
    console.warn('[WebSearch] Forex API error:', err.message);
  }
  return null;
}

/**
 * Fetches authentic, real-time live internet search results via DuckDuckGo.
 */
async function fetchDuckDuckGoSearch(query) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (response.ok) {
      const html = await response.text();
      const snippetMatches = html.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g);

      if (snippetMatches && snippetMatches.length > 0) {
        return snippetMatches
          .slice(0, 4)
          .map(s => s
            .replace(/<[^>]+>/g, '')
            .replace(/&#x27;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim()
          )
          .filter(Boolean)
          .join('\n\n');
      }
    }
  } catch (error) {
    console.warn('[WebSearch] DuckDuckGo live search error:', error.message);
  }
  return null;
}

/**
 * Master real-time context fetcher.
 * Dispatches to specialized live APIs or live web search without any hardcoded mock data.
 */
export async function fetchLiveWebContext(query) {
  if (!query || typeof query !== 'string') return null;
  const q = query.toLowerCase().trim();

  // 1. Live Weather API check
  if (/\b(weather|temperature|forecast|climate|rain)\b/i.test(q) && /lahore|punjab|pakistan/i.test(q)) {
    const liveWeather = await fetchLiveWeather();
    if (liveWeather) return liveWeather;
  }

  // 2. Live Forex / Currency API check
  if (/\b(dollar|usd|pkr|currency|exchange rate|forex|euro|riyal|dirham)\b/i.test(q)) {
    const liveForex = await fetchLiveForex();
    if (liveForex) return liveForex;
  }

  // 3. Live Web Search (Gold rates, petrol, stocks, crypto, commodities, news)
  // Ensure query targets current live rates
  let searchTarget = query;
  if (/gold|rate|tola|price/i.test(q) && !/pakistan|lahore/i.test(q)) {
    searchTarget = `${query} Pakistan Lahore today live`;
  } else if (!/today|current|live/i.test(q)) {
    searchTarget = `${query} today live`;
  }

  const liveSnippets = await fetchDuckDuckGoSearch(searchTarget);
  if (liveSnippets) {
    return liveSnippets;
  }

  // Secondary retry without extra suffixes if no snippets found
  return await fetchDuckDuckGoSearch(query);
}
