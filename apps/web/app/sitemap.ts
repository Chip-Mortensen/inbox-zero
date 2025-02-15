import type { MetadataRoute } from "next";
import { unstable_noStore } from "next/cache";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // to try fix caching issue: https://github.com/vercel/next.js/discussions/56708#discussioncomment-10127496
  unstable_noStore();

  return [
    {
      url: "https://www.getinboxzero.com/",
      priority: 1,
    },
    {
      url: "https://www.getinboxzero.com/bulk-email-unsubscriber",
    },
    {
      url: "https://www.getinboxzero.com/ai-automation",
    },
    {
      url: "https://www.getinboxzero.com/email-analytics",
    },
    {
      url: "https://www.getinboxzero.com/block-cold-emails",
    },
    {
      url: "https://www.getinboxzero.com/new-email-senders",
    },
    {
      url: "https://www.getinboxzero.com/privacy",
    },
    {
      url: "https://www.getinboxzero.com/terms",
    },
    {
      url: "https://www.getinboxzero.com/blog",
      changeFrequency: "daily" as const,
      lastModified: new Date(),
      priority: 1,
    },
    {
      url: "https://www.getinboxzero.com/blog/post/how-my-open-source-saas-hit-first-on-product-hunt",
      lastModified: new Date("2024-01-22"),
    },
    {
      url: "https://www.getinboxzero.com/blog/post/why-build-an-open-source-saas",
      lastModified: new Date("2024-01-25"),
    },
    {
      url: "https://www.getinboxzero.com/blog/post/alternatives-to-skiff-mail",
      lastModified: new Date("2024-08-22"),
    },
    {
      url: "https://www.getinboxzero.com/blog/post/best-email-unsubscribe-app",
      lastModified: new Date("2024-08-22"),
    },
    {
      url: "https://www.getinboxzero.com/blog/post/bulk-unsubscribe-from-emails",
      lastModified: new Date("2024-08-22"),
    },
    {
      url: "https://www.getinboxzero.com/blog/post/escape-email-trap-unsubscribe-for-good",
      lastModified: new Date("2024-08-22"),
    },
    {
      url: "https://docs.getinboxzero.com/",
    },
    {
      url: "https://docs.getinboxzero.com/introduction",
    },
    {
      url: "https://docs.getinboxzero.com/essentials/email-ai-automation",
    },
    {
      url: "https://docs.getinboxzero.com/essentials/bulk-email-unsubscriber",
    },
    {
      url: "https://docs.getinboxzero.com/essentials/cold-email-blocker",
    },
  ];
}
