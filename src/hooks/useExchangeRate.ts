'use client';

import { useState, useEffect } from 'react';

const DEFAULT_RATE = 0.92;
const CACHE_KEY = 'exchange_rate_usd_eur_cache';
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

interface RateInfo {
  rate: number;
  updatedAt: string | null;
  source: 'manual' | 'api' | 'default' | 'cache';
}

/** Reads the exchange rate from sessionStorage cache, or fetches it once from the API. */
export function useExchangeRate(): RateInfo {
  const [info, setInfo] = useState<RateInfo>({ rate: DEFAULT_RATE, updatedAt: null, source: 'default' });

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as RateInfo & { _cachedAt: number };
        if (Date.now() - parsed._cachedAt < CACHE_MAX_AGE_MS) {
          setInfo({ rate: parsed.rate, updatedAt: parsed.updatedAt, source: 'cache' });
          return;
        }
      }
    } catch { /* ignore */ }

    fetch('/api/system/exchange-rate')
      .then(r => r.ok ? r.json() : null)
      .then((data: RateInfo | null) => {
        if (!data || !data.rate) return;
        setInfo(data);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, _cachedAt: Date.now() }));
        } catch { /* ignore */ }
      })
      .catch(() => { /* keep default */ });
  }, []);

  return info;
}

/** Formats a USD cost value as a Euro string using the given rate. */
export function formatCostEur(usd: number, rate: number = DEFAULT_RATE): string {
  const eur = usd * rate;
  if (usd === 0) return '€0,0000';
  if (eur < 0.0001 && eur > 0) return '< €0,0001';
  return `€${eur.toFixed(4)}`;
}
