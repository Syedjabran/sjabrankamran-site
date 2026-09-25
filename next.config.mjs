/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
    // Inline global CSS into the HTML document instead of a separate
    // /_next/static/*.css request. Edge bot-mitigation (Vercel Security
    // Checkpoint) can challenge subresource requests it cannot run JS on,
    // which silently drops the stylesheet and renders the site unstyled for
    // flagged visitors (a <link> cannot retry itself). Inlining removes that
    // failure mode: if the HTML arrives, the styling arrives with it.
    // CSP already permits inline styles. Global CSS is ~76 KB raw after the
    // KaTeX/driver code-split, so the gzipped HTML cost is small.
    inlineCss: true,
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      { protocol: "https", hostname: "uiqugjlpkbzpujrisfgg.supabase.co" },
    ],
  },
  async headers() {
    // Content-Security-Policy tuned for Next.js App Router + Supabase + Vercel Analytics.
    // 'unsafe-inline' is required for Next's inline hydration bootstrap and the JSON-LD
    // script; all first-party assets, Supabase auth/storage and Vercel insights are allowed.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      // 'wasm-unsafe-eval' + the MediaPipe CDN power the on-device exam proctor
      // (FaceLandmarker). All face analysis runs locally in the browser; only the
      // model/wasm are fetched from these hosts.
      // React's development build needs eval() for its debugging tools; production never uses it.
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com https://cdn.jsdelivr.net`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://ops.sjabrankamran.com",
      "media-src 'self' blob: https://ops.sjabrankamran.com https://*.supabase.co",
      // Embedded lesson material: YouTube players, Google Drive/Docs previews and
      // signed Supabase Storage URLs (PDFs, video, audio) rendered in iframes.
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://drive.google.com https://docs.google.com https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' blob: https://*.supabase.co https://va.vercel-scripts.com https://cdn.jsdelivr.net https://storage.googleapis.com",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; ");
    return [
      {
        // HTML documents must never be served stale. Match page routes only
        // (exclude /api, Next build assets and any path with a file extension
        // like /videos/*.mp4 or /brand/*.jpg, which stay long-cached). Every
        // navigation then re-fetches the current deploy instead of a cached
        // copy — killing the "stale page on some devices" class of bug while
        // hashed assets and media keep their immutable cache.
        source: "/((?!api|_next/static|_next/image|.*\\.).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Voice attendance uses getUserMedia + the Web Speech API on the
          // first-party portal. Browser/OS permission is still required; this
          // policy only stops the server from overriding an explicit grant.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), browsing-topics=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
