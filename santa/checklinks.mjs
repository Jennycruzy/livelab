// Opens each product link the agent returned and checks it is a real, live product page.
// Usage: node checklinks.mjs links.json   (an array of {name, url} or of URL strings)
import { readFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function signals(html, productUrl) {
  const s = [];
  const ogProduct = /property=["']og:type["'][^>]*content=["'](og:)?product/i.test(html) || /content=["'](og:)?product["'][^>]*property=["']og:type/i.test(html);
  const ldProduct = /"@type"\s*:\s*"Product"/i.test(html);
  const ldItemList = /"@type"\s*:\s*"(ItemList|CollectionPage|SearchResultsPage)"/i.test(html);
  if (ogProduct) s.push('og:type product');
  if (ldProduct) s.push('json-ld Product');
  if (/itemtype=["']https?:\/\/schema\.org\/Product/i.test(html)) s.push('microdata Product');
  if (/"price"\s*:\s*"?\d|itemprop=["']price|product:price:amount/i.test(html)) s.push('price');
  if (/add[\s-]?to[\s-]?(cart|basket|bag)/i.test(html)) s.push('add to cart');
  const nProducts = (html.match(/"@type"\s*:\s*"Product"/gi) || []).length;
  if ((ldItemList || nProducts > 3) && !ogProduct && !productUrl) s.push('LIST PAGE');
  return s;
}
const title = h => (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 120);

async function check(item) {
  const url = typeof item === 'string' ? item : item.url;
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
    const html = await r.text();
    const path = new URL(r.url || url).pathname.toLowerCase();
    const productUrl = /\/(products?|p|t|dp|ip|item|itm)\/[^/]+/.test(path);
    const sig = signals(html, productUrl);
    if (/\/(themes?|category|categories|c|collections|search|s|browse|shop-all|gifts?)\/?[^/]*\/?$/.test(path) && !/\/products?\//.test(path)) sig.push('LIST PAGE (category URL)');
    const t = title(html);
    const blocked = [401, 403, 429, 503].includes(r.status) || /pardon our interruption|access denied|just a moment|are you a robot|attention required|security check/i.test(t) || html.length < 5000;
    const isProduct = sig.includes('og:type product') || sig.includes('json-ld Product') || sig.includes('microdata Product');
    const ok = r.status === 200 && !blocked && isProduct && sig.includes('price') && !sig.some(x => x.startsWith('LIST PAGE')) && t.length > 0;
    if (blocked) sig.push('BOT WALL (page may be real; pick another shop)');
    return { url, final: r.url, status: r.status, title: t, signals: sig, ok, ms: Date.now() - t0 };
  } catch (e) {
    return { url, status: 0, error: String(e.message || e), ok: false, ms: Date.now() - t0 };
  }
}

const list = JSON.parse(await readFile(process.argv[2], 'utf8'));
const res = await Promise.all(list.map(check));
for (const r of res) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.status}  ${r.title || r.error || ''}\n      ${r.final || r.url}\n      ${(r.signals || []).join(', ')}`);
const pass = res.filter(r => r.ok).length;
console.log(`\n${pass} / ${res.length} real product pages`);
process.exit(pass === res.length ? 0 : 1);
