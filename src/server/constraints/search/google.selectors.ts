/**
 * Everything specific to the google.com results page lives here, so a layout change is a one-file fix (NFR-4).
 * NOTE: written against the recorded fixture and Google's known markup; not verified against the live site,
 * which may block automated requests (then the Allrecipes fallback is used).
 */
export const GOOGLE_SELECTORS = {
  /** result anchors: classic "/url?q=" redirects and direct links */
  link: 'a[href]',
  /** a response URL that means "captcha", "unusual traffic" or "consent" */
  blockedUrl: /\/sorry\/|consent\.google\./i,
  /** body text of the block/captcha page */
  blockedBody: /unusual traffic|id="recaptcha"|action="\/sorry\//i,
};
