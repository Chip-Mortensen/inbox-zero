import Image from "next/image";
import Link from "next/link";
import { BlogLayout } from "@/components/layouts/BlogLayout";
import { Card, CardContent } from "@/components/ui/card";

type Post = {
  title: string;
  file: string;
  description: string;
  date: string;
  datetime: string;
  author: { name: string; role: string; href: string; imageUrl: string };
  imageUrl: string;
};

const posts: Post[] = [
  {
    title: "How Inbox Zero hit #1 on Product Hunt",
    file: "how-my-open-source-saas-hit-first-on-product-hunt",
    description:
      "Two weeks ago I launched Inbox Zero on Product Hunt. It finished in first place with over 1000 upvotes and gained thousands of new users. The app, Inbox Zero, helps you clean up your inbox fast. It lets you bulk unsubscribe from newsletters, automate emails with an AI assistant, automatically block cold emails, and provides email analytics.",
    date: "Jan 22, 2024",
    datetime: "2024-01-22",
    author: {
      name: "Elie Steinbock",
      role: "Founder",
      href: "#",
      imageUrl: "/images/blog/elie-profile.jpg",
    },
    imageUrl: "/images/reach-inbox-zero.png",
  },
  {
    title: "Why Build An Open Source SaaS",
    file: "why-build-an-open-source-saas",
    description:
      "Open source SaaS products are blowing up. This is why you should consider building one.",
    date: "Jan 25, 2024",
    datetime: "2024-01-25",
    author: {
      name: "Elie Steinbock",
      role: "Founder",
      href: "#",
      imageUrl: "/images/blog/elie-profile.jpg",
    },
    imageUrl: "/images/reach-inbox-zero.png",
  },
  // Add other posts as needed...
];

export const revalidate = 60;

export default async function BlogContentsPage() {
  return (
    <BlogLayout>
      <Posts posts={posts} />
    </BlogLayout>
  );
}

function Posts({ posts }: { posts: Post[] }) {
  return (
    <div className="py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="mb-8 font-cal text-3xl tracking-tight text-gray-900 sm:text-4xl">
          From the blog
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCard key={post.title} post={post} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PostCard({ post }: { post: Post }) {
  return (
    <Card className="overflow-hidden transition-transform duration-300 hover:scale-105">
      <Link href={`/blog/post/${post.file}`}>
        <div className="relative h-48 w-full">
          <Image
            src={post.imageUrl}
            alt={post.title}
            layout="fill"
            objectFit="cover"
          />
        </div>
        <CardContent className="pt-4">
          <h3 className="mb-2 font-cal text-lg leading-6 text-gray-900 group-hover:text-gray-600">
            {post.title}
          </h3>
          <p className="mb-4 line-clamp-2 text-sm leading-6 text-gray-600">
            {post.description}
          </p>
          <div className="flex items-center gap-x-4">
            <Image
              src={post.author.imageUrl}
              alt=""
              className="h-8 w-8 rounded-full bg-gray-50"
              width={32}
              height={32}
            />
            <div className="text-sm">
              <p className="font-semibold text-gray-900">{post.author.name}</p>
              <time dateTime={post.datetime} className="text-gray-500">
                {post.date}
              </time>
            </div>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
