import http from 'node:http';

/**
 * Local stand-in for every external website the app talks to (recipe pages, the nutrition database and rewe.de),
 * so e2e tests never touch the real internet. Behaviour is switched through `POST /__control`.
 */
export type Mode = 'ok' | 'error' | 'slow';

const state = { nutrition: 'ok' as Mode, price: 'ok' as Mode, slowMs: 5000 };

const jsonLd = (obj: unknown) =>
  `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body></body></html>`;

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
      Object.assign(state, { nutrition: 'ok', price: 'ok', slowMs: 5000 });
      res.end('ok');
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
