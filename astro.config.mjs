import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';

export default defineConfig({
  site: 'https://docs.telium.chat',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Telium',
      description: 'Docs for Telium, the self-hosted federated chat app.',
      logo: {
        light: './src/assets/telium-lockup-dark.svg',
        dark: './src/assets/telium-lockup-light.svg',
        replacesTitle: true,
      },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/telium-chat/telium' }],
      editLink: { baseUrl: 'https://github.com/telium-chat/docs/edit/main/' },
      lastUpdated: true,
      customCss: [
        '@fontsource-variable/ibm-plex-sans',
        '@fontsource/ibm-plex-mono/400.css',
        '@fontsource/ibm-plex-mono/500.css',
        './src/styles/theme.css',
      ],
      plugins: [starlightLinksValidator(), starlightLlmsTxt()],
      // Follow a reader's journey, not the alphabetical file layout.
      // Keep the detailed operator and protocol material available, but collapsed.
      sidebar: [
        {
          label: 'Get started',
          items: [
            { slug: 'start/first-steps', label: 'New here? Start here' },
            { slug: 'start/clients', label: 'Get the app' },
            { slug: 'start/quick-start', label: 'Try a local server' },
            { slug: 'start/architecture', label: 'How Telium works' },
            { slug: 'start/stability' },
            { slug: 'start/getting-help' },
          ],
        },
        {
          label: 'Self-host Telium',
          items: [
            { slug: 'self-hosting', label: 'Choose what to host' },
            { slug: 'self-hosting/production', label: 'Set up a homeserver' },
            { slug: 'self-hosting/install-systemd', label: 'Native Linux' },
            { slug: 'self-hosting/install-docker', label: 'Docker Compose' },
            { slug: 'self-hosting/install-docker-tunnel', label: 'Cloudflare Tunnel' },
            { slug: 'self-hosting/after-setup', label: 'After installation' },
            { slug: 'self-hosting/public-server', label: 'Public registration' },
            {
              label: 'Voice relays',
              collapsed: true,
              items: [
                { slug: 'self-hosting/sfu', label: 'SFU setup' },
                { slug: 'self-hosting/sfu-docker', label: 'SFU with Docker' },
              ],
            },
            {
              label: 'Domains, storage and maintenance',
              collapsed: true,
              items: [
                { slug: 'self-hosting/exposing', label: 'DNS and HTTPS' },
                { slug: 'self-hosting/domain-delegation', label: 'Account domains' },
                { slug: 'self-hosting/common-settings', label: 'Common settings' },
                { slug: 'self-hosting/s3-media-storage', label: 'S3 uploads' },
                { slug: 'self-hosting/backups' },
                { slug: 'self-hosting/updates' },
                { slug: 'self-hosting/server-ownership', label: 'Administrators' },
              ],
            },
            {
              label: 'Advanced operations',
              collapsed: true,
              items: [
                { slug: 'self-hosting/configuration', label: 'Configuration reference' },
                { slug: 'self-hosting/observability' },
                { slug: 'self-hosting/secrets' },
                { slug: 'self-hosting/upgrades' },
                { slug: 'self-hosting/scaling' },
                { slug: 'self-hosting/data-lifecycle' },
                { slug: 'self-hosting/disaster-recovery' },
                { slug: 'self-hosting/warm-standby' },
                { slug: 'self-hosting/relocation' },
                { slug: 'self-hosting/sunset' },
                { slug: 'self-hosting/supply-chain' },
                { slug: 'self-hosting/managed-hosting', label: 'Hosting provider catalogues' },
              ],
            },
          ],
        },
        {
          label: 'Use Telium',
          items: [
            { slug: 'features/guilds' },
            { slug: 'features/friends' },
            { slug: 'features/media' },
            { slug: 'features/voice-and-video' },
            { slug: 'features/dm-calls' },
            { slug: 'features/notifications' },
            { slug: 'features/watch-together' },
            { slug: 'features/rich-presence' },
          ],
        },
        {
          label: 'Privacy and security',
          collapsed: true,
          items: [
            { slug: 'security/privacy' },
            { slug: 'security/account-security' },
            { slug: 'security/dm-encryption' },
            { slug: 'security/network-privacy' },
            { slug: 'security/sync-encryption' },
            { slug: 'security/identity-continuity' },
            { slug: 'security/threat-model' },
          ],
        },
        {
          label: 'Federation',
          collapsed: true,
          items: [
            { slug: 'federation/overview' },
            { slug: 'federation/onboarding' },
            { slug: 'federation/migration' },
          ],
        },
        {
          label: 'Build and extend',
          collapsed: true,
          items: [
            { slug: 'features/bots' },
            { slug: 'features/interactivity' },
            { slug: 'reference/development' },
            { slug: 'reference/api' },
            { slug: 'reference/compatibility' },
            { slug: 'reference/translating' },
            {
              label: 'Protocol reference',
              collapsed: true,
              items: [
                { slug: 'reference/protocol', label: 'Protocol overview' },
                { slug: 'reference/protocol/signing' },
                { slug: 'reference/protocol/federation' },
                { slug: 'reference/protocol/gateway' },
                { slug: 'reference/protocol/mls' },
                { slug: 'reference/protocol/conformance' },
              ],
            },
          ],
        },
      ],
    }),
  ],
});
