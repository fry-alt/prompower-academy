import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Пакеты воркспейса лежат в исходниках на TypeScript и собираются вместе с приложением.
  transpilePackages: [
    '@prompower/sim-core',
    '@prompower/robot-placeholder-6dof',
    '@prompower/robot-jaka-6dof',
  ],
  // Playwright ходит на 127.0.0.1, дев-сервер слушает localhost — это один хост.
  allowedDevOrigins: ['127.0.0.1'],
};

export default withNextIntl(nextConfig);
