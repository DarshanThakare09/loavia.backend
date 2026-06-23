/**
 * Generates a unique, URL-safe slug from a given title.
 * If a collision is detected via the checkExists callback, it appends a random 4-character suffix.
 * 
 * @param title The name/title to slugify
 * @param checkExists Callback returning true if the slug is already taken
 */
export async function generateUniqueSlug(
  title: string,
  checkExists: (slug: string) => Promise<boolean>
): Promise<string> {
  // 1. Lowercase and replace spaces/underscores with hyphens
  let baseSlug = title
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    // 2. Remove all non-word characters except hyphens
    .replace(/[^\w\-]+/g, "")
    // 3. Remove consecutive hyphens
    .replace(/\-+/g, "-")
    // 4. Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, "");

  if (!baseSlug) {
    baseSlug = "item";
  }

  let slug = baseSlug;
  let isCollision = await checkExists(slug);

  if (isCollision) {
    let attempts = 0;
    // Limit collision suffix loop to prevent infinite runs
    while (isCollision && attempts < 20) {
      const suffix = Math.random().toString(36).substring(2, 6);
      slug = `${baseSlug}-${suffix}`;
      isCollision = await checkExists(slug);
      attempts++;
    }
  }

  return slug;
}
