/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/gta-map',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
