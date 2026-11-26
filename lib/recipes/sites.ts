export const RECIPE_SITES: { domain: string; name: string }[] = [
  { domain: 'allrecipes.com', name: 'Allrecipes' },
  { domain: 'foodnetwork.com', name: 'Food Network' },
  { domain: 'seriouseats.com', name: 'Serious Eats' },
  { domain: 'simplyrecipes.com', name: 'Simply Recipes' },
  { domain: 'budgetbytes.com', name: 'Budget Bytes' },
  { domain: 'halfbakedharvest.com', name: 'Half Baked Harvest' },
  { domain: 'delish.com', name: 'Delish' },
  { domain: 'tasteofhome.com', name: 'Taste of Home' },
  { domain: 'eatingwell.com', name: 'EatingWell' },
  { domain: 'bonappetit.com', name: 'Bon Appétit' },
  { domain: 'epicurious.com', name: 'Epicurious' },
  { domain: 'thekitchn.com', name: 'The Kitchn' },
  { domain: 'food.com', name: 'Food.com' },
  { domain: 'loveandlemons.com', name: 'Love and Lemons' },
  { domain: 'cookieandkate.com', name: 'Cookie and Kate' },
  { domain: 'pinchofyum.com', name: 'Pinch of Yum' },
];

/** The site a host belongs to: an exact domain match or a subdomain of it. */
export function siteForHost(host: string): { domain: string; name: string } | null {
  const h = host.toLowerCase().replace(/\.$/, '');
  return RECIPE_SITES.find((s) => h === s.domain || h.endsWith(`.${s.domain}`)) ?? null;
}
