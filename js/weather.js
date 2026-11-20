/* 聚仁 · 天气层
 * 使用 Open-Meteo 免费接口（无需 Key）。失败时退回本地示例天气，
 * 并在界面上明确标注，绝不把示例数据伪装成真实预报。
 */

import { toISODate, addDays } from './parser.js';

export const DEFAULT_CITY = {
  name: '北京',
  admin1: '北京市',
  lat: 39.9042,
  lon: 116.4074,
};

const CACHE_MS = 3 * 60 * 60 * 1000;

function withTimeout(ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

export async function searchCity(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=zh&format=json`;
  const t = withTimeout();
  try {
    const res = await fetch(url, { signal: t.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`城市搜索失败 ${res.status}`);
    const data = await res.json();
    return (data.results || []).map((r) => ({
      name: r.name,
      admin1: r.admin1 || '',
      country: r.country || '',
      lat: r.latitude,
      lon: r.longitude,
    }));
  } finally {
    t.done();
  }
}

export async function fetchForecast(city) {
  const c = city || DEFAULT_CITY;
  const url = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${c.lat}&longitude=${c.lon}`,
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    '&timezone=auto&forecast_days=10',
  ].join('');
  const t = withTimeout();
  try {
    const res = await fetch(url, { signal: t.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`天气服务 ${res.status}`);
    const data = await res.json();
    const d = data.daily || {};
    const days = {};
    (d.time || []).forEach((date, i) => {
      days[date] = {
        code: Number(d.weather_code?.[i] ?? 0),
        max: Math.round(Number(d.temperature_2m_max?.[i] ?? 0)),
        min: Math.round(Number(d.temperature_2m_min?.[i] ?? 0)),
        precip: Number(d.precipitation_probability_max?.[i] ?? 0),
        wind: Math.round(Number(d.wind_speed_10m_max?.[i] ?? 0)),
      };
    });
    return {
      city: c,
      source: 'open-meteo',
      fetchedAt: new Date().toISOString(),
      days,
    };
  } finally {
    t.done();
  }
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 离线示例天气：只在拿不到真实预报时使用。 */
export function demoWeather(city = DEFAULT_CITY, start = new Date(), count = 14) {
  const days = {};
  const codes = [0, 1, 2, 3, 61, 80, 3, 1, 0, 2];
  for (let i = 0; i < count; i++) {
    const d = addDays(start, i);
    const key = toISODate(d);
    const h = hash(`${key}|${city.name}`);
    const month = d.getMonth() + 1;
    const seasonal = month >= 6 && month <= 8 ? 30 : month >= 11 || month <= 2 ? 9 : 21;
    const max = seasonal + (h % 6) - 2;
    const code = codes[h % codes.length];
    days[key] = {
      code,
      max,
      min: max - (5 + (h % 5)),
      precip: [0, 1, 2, 3].includes(code) ? (h % 30) : 40 + (h % 55),
      wind: 6 + (h % 18),
    };
  }
  return {
    city,
    source: 'demo',
    fetchedAt: new Date().toISOString(),
    days,
  };
}

export async function ensureWeather(city, cached, force = false) {
  const c = city || DEFAULT_CITY;
  const fresh = cached?.fetchedAt && (Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_MS);
  const sameCity = Math.abs((cached?.city?.lat || 0) - c.lat) < 0.01
    && Math.abs((cached?.city?.lon || 0) - c.lon) < 0.01;
  const covers = cached?.days && cached.days[toISODate(new Date())];
  const isLive = cached?.source === 'open-meteo';
  if (!force && isLive && fresh && sameCity && covers) return { ...cached, stale: false };
  try {
    const data = await fetchForecast(c);
    if (!Object.keys(data.days).length) throw new Error('天气数据为空');
    return { ...data, stale: false };
  } catch (err) {
    const demo = cached?.days ? cached : demoWeather(c);
    return { ...demo, source: demo.source || 'demo', stale: true, error: err.message };
  }
}

export function weatherFor(weather, date) {
  if (weather?.days?.[date]) return { ...weather.days[date], source: weather.source };
  return { ...demoWeather(weather?.city || DEFAULT_CITY, new Date(`${date}T00:00:00`), 1).days[date], source: 'demo' };
}
