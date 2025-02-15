import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import { withAxiom } from "next-axiom";
import nextMdx from "@next/mdx";
import { createJiti } from "jiti";
import withSerwistInit from "@serwist/next";

const jiti = createJiti(fileURLToPath(import.meta.url));

// Import env here to validate during build. Using jiti we can import .ts files :)
await jiti.import("./env");

const withMDX = nextMdx();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    serverComponentsExternalPackages: ["@sentry/nextjs", "@sentry/node"],
    instrumentationHook: true,
    // Add transpilePackages to ensure proper handling of client-side modules
    transpilePackages: ["ai"],
    turbo: {
      rules: {
        "*.svg": {
          loaders: ["@svgr/webpack"],
          as: "*.js",
        },
      },
    },
  },
  webpack: (config, { dev, isServer }) => {
    // Add module exclusions for server-side code
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        // Exclude browser-specific modules from server build
        "ai/streams": false,
        "ai/react": false,
      };

      const originalEntry = config.entry;
      config.entry = async () => {
        const entries = await originalEntry();
        // These packages use browser-specific globals
        if (entries["pages/_app"]) {
          entries["pages/_app"] = entries["pages/_app"].filter(
            (entry) => !entry.includes("node_modules/ai/"),
          );
        }
        return entries;
      };
    }

    // Optimize production builds
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        moduleIds: "deterministic",
        splitChunks: {
          chunks: "all",
          cacheGroups: {
            default: false,
            vendors: false,
            // Bundle commonly used packages together
            framework: {
              chunks: "all",
              name: "framework",
              test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom|scheduler|next|@next|@vercel)[\\/]/,
              priority: 40,
              enforce: true,
            },
            ai: {
              chunks: (chunk) => !isServer && chunk.name === "pages/_app",
              test: /[\\/]node_modules[\\/](ai)[\\/]/,
              name: "ai-lib",
              priority: 30,
              reuseExistingChunk: true,
            },
            tremor: {
              test: /[\\/]node_modules[\\/](@tremor)[\\/]/,
              name: "tremor",
              chunks: "all",
              priority: 20,
            },
            charts: {
              test: /[\\/]node_modules[\\/](chart\.js|react-chartjs-2)[\\/]/,
              name: "charts",
              chunks: "all",
              priority: 20,
            },
            commons: {
              name: "commons",
              minChunks: 2,
              priority: 10,
            },
            // Bundle remaining node_modules together
            lib: {
              test: /[\\/]node_modules[\\/]/,
              name: isServer ? "lib-server" : "lib-client",
              chunks: "all",
              priority: -10,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    return config;
  },
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pbs.twimg.com",
      },
      {
        protocol: "https",
        hostname: "ph-avatars.imgix.net",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/automation",
        has: [
          {
            type: "cookie",
            key: "__Secure-authjs.session-token",
          },
        ],
        permanent: false,
      },
      {
        source: "/",
        destination: "/automation",
        has: [
          {
            type: "cookie",
            key: "__Secure-authjs.session-token.0",
          },
        ],
        permanent: false,
      },
      {
        source: "/",
        destination: "/automation",
        has: [
          {
            type: "cookie",
            key: "__Secure-authjs.session-token.1",
          },
        ],
        permanent: false,
      },
      {
        source: "/",
        destination: "/automation",
        has: [
          {
            type: "cookie",
            key: "__Secure-authjs.session-token.2",
          },
        ],
        permanent: false,
      },
      {
        source: "/feature-requests",
        destination: "https://inboxzero.featurebase.app",
        permanent: true,
      },
      {
        source: "/feedback",
        destination: "https://inboxzero.featurebase.app",
        permanent: true,
      },
      {
        source: "/roadmap",
        destination: "https://inboxzero.featurebase.app/roadmap",
        permanent: true,
      },
      {
        source: "/changelog",
        destination: "https://inboxzero.featurebase.app/changelog",
        permanent: true,
      },
      {
        source: "/twitter",
        destination: "https://twitter.com/inboxzero_ai",
        permanent: true,
      },
      {
        source: "/github",
        destination: "https://github.com/elie222/inbox-zero",
        permanent: true,
      },
      {
        source: "/discord",
        destination: "https://discord.gg/UnBwsydrug",
        permanent: true,
      },
      {
        source: "/linkedin",
        destination: "https://www.linkedin.com/company/inbox-zero-ai/",
        permanent: true,
      },
      {
        source: "/waitlist",
        destination: "https://airtable.com/shr7HNx6FXaIxR5q6",
        permanent: true,
      },
      {
        source: "/affiliates",
        destination: "https://inboxzero.lemonsqueezy.com/affiliates",
        permanent: true,
      },
      {
        source: "/newsletters",
        destination: "/bulk-unsubscribe",
        permanent: false,
      },
      {
        source: "/request-access",
        destination: "/early-access",
        permanent: true,
      },
      {
        source: "/reply-tracker",
        destination: "/reply-zero",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/ingest/:path*",
        destination: "https://app.posthog.com/:path*",
      },
    ];
  },
  // Security headers: https://nextjs.org/docs/app/building-your-application/configuring/progressive-web-apps#8-securing-your-application
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval'",
          },
        ],
      },
    ];
  },
};

const sentryOptions = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suppresses source map uploading logs during build
  silent: true,
  org: process.env.SENTRY_ORGANIZATION,
  project: process.env.SENTRY_PROJECT,
};

const sentryConfig = {
  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Transpiles SDK to be compatible with IE11 (increases bundle size)
  transpileClientSDK: true,

  // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers (increases server load)
  tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors.
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
};

const mdxConfig = withMDX(nextConfig);

const useSentry =
  process.env.NEXT_PUBLIC_SENTRY_DSN &&
  process.env.SENTRY_ORGANIZATION &&
  process.env.SENTRY_PROJECT;

const exportConfig = useSentry
  ? withSentryConfig(mdxConfig, { ...sentryOptions, ...sentryConfig })
  : mdxConfig;

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
});

export default withAxiom(withSerwist(exportConfig));
