import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Пакеты воркспейса лежат в исходниках на TypeScript и собираются вместе с приложением.
  transpilePackages: ['@prompower/sim-core', '@prompower/robot-plugins', '@prompower/blocks'],
  // Playwright ходит на 127.0.0.1, дев-сервер слушает localhost — это один хост.
  allowedDevOrigins: ['127.0.0.1'],
  poweredByHeader: false,
  // Docker-образ собирается в режиме standalone (см. Dockerfile). Локально
  // остаётся обычная сборка: `next start` со standalone не работает.
  ...(process.env['NEXT_OUTPUT'] === 'standalone' ? { output: 'standalone' as const } : {}),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Платформу не встраивают в чужие страницы: среди учеников дети.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
