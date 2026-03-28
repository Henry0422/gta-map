/** @type {import('next').NextConfig} */
const isProd = process.env.BASE_PATH !== undefined && process.env.BASE_PATH !== '';
const nextConfig = {
  output: 'export',
  basePath: isProd ? process.env.BASE_PATH : '',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
