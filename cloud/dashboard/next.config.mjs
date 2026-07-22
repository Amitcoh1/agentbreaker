/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dashboard moved under /dashboard when / became the marketing page. Preserve old links.
  async redirects() {
    return [
      { source: "/runs", destination: "/dashboard/runs", permanent: true },
      { source: "/runs/:runId", destination: "/dashboard/runs/:runId", permanent: true },
      { source: "/builder", destination: "/dashboard/builder", permanent: true },
      { source: "/settings", destination: "/dashboard/settings", permanent: true },
    ];
  },
};

export default nextConfig;
