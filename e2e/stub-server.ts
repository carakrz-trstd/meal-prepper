import http from 'node:http';

/**
 * Local stand-in for every external website the app talks to (recipe pages, the nutrition database and rewe.de),
 * so e2e tests never touch the real internet. Behaviour is switched through `POST /__control`.
 */
export type Mode = 'ok' | 'error' | 'slow';

const jsonLd = (obj: unknown) =>
  `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body></body></html>`;

export type GoogleMode = 'results' | 'captcha' | '429' | 'empty';
export type AllrecipesMode = 'results' | 'error';

const initial = () => ({
  nutrition: 'ok' as Mode,
  price: 'ok' as Mode,
  slowMs: 5000,
  google: 'results' as GoogleMode,
  allrecipes: 'results' as AllrecipesMode,
  /** > 0: the Google results also list /r/online-slow, which answers only after this many ms */
  slowRecipe: 0,
  /** delay before each online recipe page answers, to make candidates arrive one by one */
  stagger: 0,
});
const state = initial();
const counts = { google: 0, allrecipes: 0, recipePages: 0, fetched: [] as string[] };
const resetCounts = () => Object.assign(counts, { google: 0, allrecipes: 0, recipePages: 0, fetched: [] });

// --- Epic 3: recipes found by the online search (served under /r/ and /recipe/) ---
const onlineRecipe = (name: string, ingredients: string[], calories: number | null, costEur: number | null, prep = 'PT10M', cook = 'PT20M') =>
  jsonLd({
    '@context': 'https://schema.org', '@type': 'Recipe', name, recipeIngredient: ingredients,
    prepTime: prep, cookTime: cook, recipeYield: '4 servings',
    ...(calories === null ? {} : { nutrition: { '@type': 'NutritionInformation', calories: `${calories} kcal` } }),
    ...(costEur === null ? {} : { estimatedCost: { '@type': 'MonetaryAmount', currency: 'EUR', value: String(costEur) } }),
  });

const ONLINE_RECIPES: Record<string, string> = {
  '/r/online-lentil': onlineRecipe('Online Lentil Bowl', ['200 g Lentils', '100 g Carrot'], 300, 6),
  '/r/online-pasta': onlineRecipe('Online Pasta Bake', ['300 g Pasta', '100 g Tomatoes'], 520, 8, 'PT10M', 'PT15M'),
  '/r/online-extra': onlineRecipe('Online Veggie Stew', ['200 g Zucchini', '100 g Carrot'], 350, 5, 'PT5M', 'PT20M'),
  '/r/online-nutty': onlineRecipe('Online Nutty Bar', ['100 g Mixed nuts'], 300, 5),
  '/r/online-dup': onlineRecipe('Online Duplicate Chili', ['200 g Beans'], 400, 4),
  '/r/online-slow': onlineRecipe('Online Slow Roast', ['500 g Potatoes'], 450, 7),
  '/r/online-unparsable': '<!doctype html><html><body><h1>Cookie banner</h1><p>No recipe here.</p></body></html>',
  '/recipe/ar-1/allrecipes-bowl/': onlineRecipe('Allrecipes Bowl', ['150 g Rice', '100 g Carrot'], 280, 5),
  '/recipe/ar-2/allrecipes-stew/': onlineRecipe('Allrecipes Stew', ['200 g Lentils'], 310, 4),
};

const PAGES: Record<string, string> = {
  '/recipe-jsonld': jsonLd({
    '@context': 'https://schema.org', '@type': 'Recipe', name: 'Stub Pasta',
    recipeIngredient: ['200 g Spaghetti', '400 g Tomatoes', '1 EL Olive oil'],
    prepTime: 'PT10M', cookTime: 'PT20M', recipeYield: '2 servings',
  }),
  '/recipe-unmatched': jsonLd({
    '@type': 'Recipe', name: 'Mystery Dish',
    recipeIngredient: ['200 g Spaghetti', '100 g Unobtanium'],
    prepTime: 'PT5M', cookTime: 'PT15M', recipeYield: '2',
  }),
  '/recipe-noyield': jsonLd({
    '@type': 'Recipe', name: 'No Yield Soup', recipeIngredient: ['1 kg Carrots'], cookTime: 'PT30M',
  }),
  '/recipe-html': `<!doctype html><html><body><h1>Kartoffelsuppe</h1><h2>Zutaten</h2>
    <ul><li>500 g Kartoffeln</li><li>1 Zwiebel</li><li>1 l Brühe</li></ul></body></html>`,
  '/not-a-recipe': '<!doctype html><html><body><h1>Welcome</h1><p>No recipe here.</p></body></html>',
};

// kcal per 100 g and price per 1 kg pack for the stub ingredients; "Unobtanium" is intentionally unknown.
const KCAL: Record<string, number> = { spaghetti: 350, tomatoes: 20, 'olive oil': 880 };

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startStubServer(port = 4180): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');

    if (req.method === 'POST' && url.pathname === '/__control') {
      let body = '';
      for await (const c of req) body += c;
      Object.assign(state, JSON.parse(body || '{}'));
      res.end('ok');
      return;
    }
    if (url.pathname === '/__reset') {
      Object.assign(state, initial());
      resetCounts();
      res.end('ok');
      return;
    }
    if (url.pathname === '/__counts') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(counts));
      return;
    }

    // Google results page stand-in: /google/search?q=...
    if (url.pathname === '/google/search') {
      counts.google += 1;
      if (state.google === '429') {
        res.statusCode = 429;
        res.end('Too Many Requests');
        return;
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      if (state.google === 'captcha') {
        res.end('<html><body><form action="/sorry/index"><div>Our systems have detected unusual traffic from your computer network.</div></form></body></html>');
        return;
      }
      if (state.google === 'empty') {
        res.end('<html><body><div id="search"><p>Your search did not match any documents.</p></div></body></html>');
        return;
      }
      const recipes = ['lentil', 'pasta', 'dup', 'unparsable', 'nutty', 'extra', ...(state.slowRecipe > 0 ? ['slow'] : [])];
      const links = recipes
        .map((r) => `<div class="g"><a href="/url?q=${encodeURIComponent(`http://127.0.0.1:4180/r/online-${r}`)}&amp;sa=U"><h3>${r}</h3></a></div>`)
        .join('\n');
      res.end(`<html><body><div id="search">${links}</div><a href="https://www.google.com/preferences">Settings</a></body></html>`);
      return;
    }

    // allrecipes.com stand-in: /allrecipes/search?q=...
    if (url.pathname === '/allrecipes/search') {
      counts.allrecipes += 1;
      if (state.allrecipes === 'error') {
        res.statusCode = 503;
        res.end('unavailable');
        return;
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(
        '<html><body><a href="/recipe/ar-1/allrecipes-bowl/">Bowl</a><a href="/recipe/ar-2/allrecipes-stew/">Stew</a><a href="/recipes/80/main-dish/">Category</a></body></html>',
      );
      return;
    }

    // online recipe pages
    if (ONLINE_RECIPES[url.pathname]) {
      counts.recipePages += 1;
      counts.fetched.push(url.pathname);
      if (url.pathname === '/r/online-slow') await delay(state.slowRecipe || 10_000);
      else if (state.stagger > 0) await delay(state.stagger * (1 + (Object.keys(ONLINE_RECIPES).indexOf(url.pathname) % 3)));
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(ONLINE_RECIPES[url.pathname]);
      return;
    }

    if (url.pathname === '/unreachable') {
      res.statusCode = 500;
      res.end('broken');
      return;
    }

    if (PAGES[url.pathname]) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(PAGES[url.pathname]);
      return;
    }

    // Open Food Facts stand-in
    if (url.pathname === '/cgi/search.pl') {
      if (state.nutrition === 'slow') await delay(state.slowMs);
      if (state.nutrition === 'error') {
        res.statusCode = 503;
        res.end('down');
        return;
      }
      const term = (url.searchParams.get('search_terms') ?? '').toLowerCase();
      const kcal = KCAL[term];
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ products: kcal === undefined ? [] : [{ product_name: term, nutriments: { 'energy-kcal_100g': kcal } }] }));
      return;
    }

    // rewe.de stand-in: every known ingredient costs 2.00 EUR per 1 kg pack
    if (url.pathname === '/productList') {
      if (state.price === 'slow') await delay(state.slowMs);
      if (state.price === 'error') {
        res.statusCode = 429;
        res.end('slow down');
        return;
      }
      const term = (url.searchParams.get('search') ?? '').toLowerCase();
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(
        term in KCAL
          ? `<html><body><article class="search-service-product"><h4 class="search-service-productTitle">${term}</h4>
             <div class="search-service-productGrammage">1 kg</div><div class="search-service-productPrice">2,00 €</div></article></body></html>`
          : '<html><body><p>Keine Treffer</p></body></html>',
      );
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
