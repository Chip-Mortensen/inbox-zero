import type { ResolvingMetadata } from "next";
import { notFound } from "next/navigation";

const posts = [
  {
    slug: "how-my-open-source-saas-hit-first-on-product-hunt",
    title: "How Inbox Zero hit #1 on Product Hunt",
    description: "Two weeks ago I launched Inbox Zero on Product Hunt...",
    date: "2024-01-22",
  },
  {
    slug: "why-build-an-open-source-saas",
    title: "Why Build An Open Source SaaS",
    description: "Open source SaaS products are blowing up...",
    date: "2024-01-25",
  },
  // Add other posts here...
];

export const revalidate = 60;

export async function generateStaticParams() {
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

type Props = {
  params: { slug: string };
};

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
) {
  const post = posts.find((p) => p.slug === params.slug);

  if (!post) return {};

  const previousImages = (await parent).openGraph?.images || [];

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/post/${params.slug}` },
    openGraph: {
      images: previousImages,
    },
  };
}

export default async function Page({ params }: Props) {
  const post = posts.find((p) => p.slug === params.slug);

  if (!post) notFound();

  return (
    <div className="prose mx-auto max-w-4xl p-6">
      <h1>{post.title}</h1>
      <p className="text-gray-600">{post.date}</p>
      <p>{post.description}</p>
      <p>Full content coming soon...</p>
    </div>
  );
}
