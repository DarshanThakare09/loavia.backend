import { prisma } from "../config/prisma";

const DEFAULT_ANNOUNCEMENT = "✨ Free shipping on all orders over ₹999! Taste the magic of Nashik. ✨    |    100% Organic, Zero Preservatives    |    Use code LOAVIA10 for 10% off your first order! ✨";

const DEFAULT_WHY_CHOOSE_FEATURES = JSON.stringify([
  "No Maida in Millet Cookies",
  "No Preservatives",
  "Made with Natural Millets",
  "High Fiber",
  "Freshly Baked",
  "Premium Ingredients",
]);

const DEFAULT_FOUNDER_TEXT = `Baking has always been more than a passion — it has been a part of my heart and identity. After my children became independent and began shaping their own paths, I chose to dedicate my time to something that truly fulfilled me — the art of baking.

My journey formally began in 2021, when I stepped into professional baking with curiosity and determination. I trained through specialized baking courses, and in 2022, I proudly earned my certification as a Pâtissier Chef. Soon after, I established Akshar Foods and introduced my bakery brand, “The Pastry Saga,” where every creation was crafted with love, care, and detail.

Yet, deep within, I carried a larger vision — to create cookies that were not only delicious but also genuinely nourishing. This vision naturally led me to the world of millets.

Millets are not new to India; they are part of our ancient food heritage. Rich in fiber, protein, calcium, iron, and essential minerals, they once formed the foundation of our traditional diet. Over time, with modern lifestyles and processed foods, these powerful grains slowly faded from our daily lives.

As I explored them deeper, I realized their true potential — supporting children’s growth, improving digestion, strengthening heart health, and enhancing overall wellness.

However, transforming these ancient grains into a truly delicious cookie was not easy. After countless experiments, refinements, and passion-driven trials, I finally created what I had envisioned — a wholesome, balanced, and delightful bite.

Today, LOAVIA™ proudly brings you premium millet cookies crafted with love, freshness, and purpose — where health meets indulgence.`;

const DEFAULT_NASHIK_ROOTS_TEXT1 = "Nestled in the vibrant agricultural heartland of Nashik, Maharashtra, LOAVIA began as a passionate dream to redefine the Indian cookie experience. We believe that an authentic Indian brand can seamlessly blend local agricultural richness with international baking standards.";
const DEFAULT_NASHIK_ROOTS_TEXT2 = "Every LOAVIA cookie is handcrafted daily in small batches in our Nashik kitchen. We don't just bake; we weave the spirit, warmth, and flavor of India into every single bite, creating pure, unadulterated joy without any preservatives or artificial flavors.";

const DEFAULT_SHOP_BY_MOOD_LIST = JSON.stringify([
  { id: "sweet", name: "Craving Sweet", icon: "Heart", image: "/stuffed_cookie.png", link: "/shop?mood=sweet" },
  { id: "healthy", name: "Healthy Fix", icon: "Sparkles", image: "/vegan_cookie.png", link: "/shop?mood=healthy" },
  { id: "tea", name: "Perfect with Tea", icon: "Coffee", image: "/premium_cookie.png", link: "/shop?mood=tea" },
  { id: "gifting", name: "Gifting", icon: "Gift", image: "/cookie_gift_box.png", link: "/shop?mood=gifting" }
]);

const DEFAULT_CATEGORIES_LIST = JSON.stringify([
  { name: "Classic Collection", image: "/premium_cookie.png", link: "/shop?category=classic" },
  { name: "Vegan Options", image: "/vegan_cookie.png", link: "/shop?category=vegan" },
  { name: "Gluten-Free", image: "/gluten_free_cookie.png", link: "/shop?category=gluten-free" }
]);

export interface HomepageSettings {
  announcementText: string;
  heroTitle: string;
  heroSubtitle: string;
  bestSellersTitle: string;
  bestSellersSubtitle: string;
  featuredProductsTitle: string;
  featuredProductsSubtitle: string;
  featuredProductsCtaText: string;
  whyChooseTitle: string;
  whyChooseDescription: string;
  whyChooseFeatures: string;
  giftingTitle: string;
  giftingDescription: string;
  aboutStoryTitle: string;
  aboutStorySubtitle: string;
  aboutFounderName: string;
  aboutFounderText: string;
  aboutMeaningTitle: string;
  aboutMeaningSubtitle: string;
  aboutMeaningText1: string;
  aboutMeaningText2: string;
  aboutMeaningText3: string;
  aboutNashikRootsTitle: string;
  aboutNashikRootsText1: string;
  aboutNashikRootsText2: string;
  aboutStat1Number: string;
  aboutStat1Title: string;
  aboutStat1Desc: string;
  aboutStat2Number: string;
  aboutStat2Title: string;
  aboutStat2Desc: string;
  aboutStat3Number: string;
  aboutStat3Title: string;
  aboutStat3Desc: string;
  shopByMoodTitle: string;
  shopByMoodSubtitle: string;
  shopByMoodList: string;
  categoriesList: string;
}

// Maps typescript camelCase keys to database snake_case keys
const KEY_MAPPING: Record<keyof HomepageSettings, string> = {
  announcementText: "announcement_text",
  heroTitle: "hero_title",
  heroSubtitle: "hero_subtitle",
  bestSellersTitle: "best_sellers_title",
  bestSellersSubtitle: "best_sellers_subtitle",
  featuredProductsTitle: "featured_products_title",
  featuredProductsSubtitle: "featured_products_subtitle",
  featuredProductsCtaText: "featured_products_cta_text",
  whyChooseTitle: "why_choose_title",
  whyChooseDescription: "why_choose_description",
  whyChooseFeatures: "why_choose_features",
  giftingTitle: "gifting_title",
  giftingDescription: "gifting_description",
  aboutStoryTitle: "about_story_title",
  aboutStorySubtitle: "about_story_subtitle",
  aboutFounderName: "about_founder_name",
  aboutFounderText: "about_founder_text",
  aboutMeaningTitle: "about_meaning_title",
  aboutMeaningSubtitle: "about_meaning_subtitle",
  aboutMeaningText1: "about_meaning_text1",
  aboutMeaningText2: "about_meaning_text2",
  aboutMeaningText3: "about_meaning_text3",
  aboutNashikRootsTitle: "about_nashik_roots_title",
  aboutNashikRootsText1: "about_nashik_roots_text1",
  aboutNashikRootsText2: "about_nashik_roots_text2",
  aboutStat1Number: "about_stat1_number",
  aboutStat1Title: "about_stat1_title",
  aboutStat1Desc: "about_stat1_desc",
  aboutStat2Number: "about_stat2_number",
  aboutStat2Title: "about_stat2_title",
  aboutStat2Desc: "about_stat2_desc",
  aboutStat3Number: "about_stat3_number",
  aboutStat3Title: "about_stat3_title",
  aboutStat3Desc: "about_stat3_desc",
  shopByMoodTitle: "shop_by_mood_title",
  shopByMoodSubtitle: "shop_by_mood_subtitle",
  shopByMoodList: "shop_by_mood_list",
  categoriesList: "categories_list",
};

export class SettingsService {
  async getSettings(): Promise<HomepageSettings> {
    const dbSettings = await prisma.setting.findMany();
    
    const settingsMap = dbSettings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    return {
      announcementText: settingsMap[KEY_MAPPING.announcementText] ?? DEFAULT_ANNOUNCEMENT,
      heroTitle: settingsMap[KEY_MAPPING.heroTitle] ?? "Healthy Inside,\nYummy Outside.",
      heroSubtitle: settingsMap[KEY_MAPPING.heroSubtitle] ?? "Premium millet cookies and healthy bakery products crafted with wholesome ingredients, rich flavours, and freshly baked goodness.",
      bestSellersTitle: settingsMap[KEY_MAPPING.bestSellersTitle] ?? "Our Best Sellers",
      bestSellersSubtitle: settingsMap[KEY_MAPPING.bestSellersSubtitle] ?? "The cookies everyone is talking about.",
      featuredProductsTitle: settingsMap[KEY_MAPPING.featuredProductsTitle] ?? "Featured Products",
      featuredProductsSubtitle: settingsMap[KEY_MAPPING.featuredProductsSubtitle] ?? "Explore our most loved millet cookies crafted for tea-time indulgence, healthy snacking, and premium gifting.",
      featuredProductsCtaText: settingsMap[KEY_MAPPING.featuredProductsCtaText] ?? "Explore Products",
      whyChooseTitle: settingsMap[KEY_MAPPING.whyChooseTitle] ?? "Why Choose LOAVIA™",
      whyChooseDescription: settingsMap[KEY_MAPPING.whyChooseDescription] ?? "At LOAVIA™, we believe healthy snacking should never compromise on taste. Our millet cookies are thoughtfully baked using premium ingredients, natural millets, and delicious flavours to create guilt-free indulgence for every age group.",
      whyChooseFeatures: settingsMap[KEY_MAPPING.whyChooseFeatures] ?? DEFAULT_WHY_CHOOSE_FEATURES,
      giftingTitle: settingsMap[KEY_MAPPING.giftingTitle] ?? "Healthy gifting made Delicious",
      giftingDescription: settingsMap[KEY_MAPPING.giftingDescription] ?? "Celebrate special moments with beautifully crafted LOAVIA™ cookie hampers. Our premium millet cookies make thoughtful gifts for festivals, corporate events, family celebrations, and special occasions.",
      aboutStoryTitle: settingsMap[KEY_MAPPING.aboutStoryTitle] ?? "Our Story",
      aboutStorySubtitle: settingsMap[KEY_MAPPING.aboutStorySubtitle] ?? "Born in the heart of Maharashtra. Baked with world-class perfection.",
      aboutFounderName: settingsMap[KEY_MAPPING.aboutFounderName] ?? "Pranita Vivek Patil",
      aboutFounderText: settingsMap[KEY_MAPPING.aboutFounderText] ?? DEFAULT_FOUNDER_TEXT,
      aboutMeaningTitle: settingsMap[KEY_MAPPING.aboutMeaningTitle] ?? "LOAVIA™",
      aboutMeaningSubtitle: settingsMap[KEY_MAPPING.aboutMeaningSubtitle] ?? "A Celebration of Love for Wholesome Baking",
      aboutMeaningText1: settingsMap[KEY_MAPPING.aboutMeaningText1] ?? "The name LOAVIA™ is inspired by Loaf — bakery and baked goodness and Via/Avia — journey, lifestyle, and nourishment.",
      aboutMeaningText2: settingsMap[KEY_MAPPING.aboutMeaningText2] ?? "At LOAVIA™, freshness and health matter more than mass production. We use fresh ingredients and freshly prepared millets in every batch, which is why our millet cookies have a shelf life of only one month.",
      aboutMeaningText3: settingsMap[KEY_MAPPING.aboutMeaningText3] ?? "Our mission is to bring back the goodness of traditional grains in a delicious modern form for today’s generation.",
      aboutNashikRootsTitle: settingsMap[KEY_MAPPING.aboutNashikRootsTitle] ?? "The Nashik Roots",
      aboutNashikRootsText1: settingsMap[KEY_MAPPING.aboutNashikRootsText1] ?? DEFAULT_NASHIK_ROOTS_TEXT1,
      aboutNashikRootsText2: settingsMap[KEY_MAPPING.aboutNashikRootsText2] ?? DEFAULT_NASHIK_ROOTS_TEXT2,
      aboutStat1Number: settingsMap[KEY_MAPPING.aboutStat1Number] ?? "100%",
      aboutStat1Title: settingsMap[KEY_MAPPING.aboutStat1Title] ?? "Organic Flour",
      aboutStat1Desc: settingsMap[KEY_MAPPING.aboutStat1Desc] ?? "Sourced responsibly for the best texture and health benefits.",
      aboutStat2Number: settingsMap[KEY_MAPPING.aboutStat2Number] ?? "Zero",
      aboutStat2Title: settingsMap[KEY_MAPPING.aboutStat2Title] ?? "Preservatives",
      aboutStat2Desc: settingsMap[KEY_MAPPING.aboutStat2Desc] ?? "Absolutely no artificial colors, flavors, or chemicals.",
      aboutStat3Number: settingsMap[KEY_MAPPING.aboutStat3Number] ?? "Daily",
      aboutStat3Title: settingsMap[KEY_MAPPING.aboutStat3Title] ?? "Freshly Baked",
      aboutStat3Desc: settingsMap[KEY_MAPPING.aboutStat3Desc] ?? "Made fresh every morning in our Nashik kitchen.",
      shopByMoodTitle: settingsMap[KEY_MAPPING.shopByMoodTitle] ?? "What's your mood?",
      shopByMoodSubtitle: settingsMap[KEY_MAPPING.shopByMoodSubtitle] ?? "Whether you need a mid-day energy boost or a decadent midnight snack, we have a cookie crafted just for how you feel.",
      shopByMoodList: settingsMap[KEY_MAPPING.shopByMoodList] ?? DEFAULT_SHOP_BY_MOOD_LIST,
      categoriesList: settingsMap[KEY_MAPPING.categoriesList] ?? DEFAULT_CATEGORIES_LIST,
    };
  }

  async updateSettings(data: Partial<HomepageSettings>): Promise<HomepageSettings> {
    for (const [key, value] of Object.entries(data)) {
      const dbKey = KEY_MAPPING[key as keyof HomepageSettings];
      if (dbKey && value !== undefined && value !== null) {
        await prisma.setting.upsert({
          where: { key: dbKey },
          update: { value: value.toString() },
          create: { key: dbKey, value: value.toString() },
        });
      }
    }

    return this.getSettings();
  }
}
