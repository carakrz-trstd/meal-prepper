/**
 * All site-specific knowledge about the rewe.de product search page lives here, so a layout change is a
 * one-file fix (NFR-9). NOTE: these selectors were written against the recorded fixture and have not been
 * verified against the live site, which may render results with JavaScript or block automated requests.
 */
export const REWE_SELECTORS = {
  searchPath: '/productList?search=',
  tile: 'article.search-service-product',
  price: '.search-service-productPrice',
  pack: '.search-service-productGrammage',
};
