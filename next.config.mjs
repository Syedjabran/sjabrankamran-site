/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
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
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://va.vercel-scripts.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://ops.sjabrankamran.com",
      "media-src 'self' blob: https://ops.sjabrankamran.com",
      "font-src 'self' data:",
      "connect-src 'self' blob: https://*.supabase.co https://va.vercel-scripts.com https://cdn.jsdelivr.net https://storage.googleapis.com",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; ");
    return [
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
