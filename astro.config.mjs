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
      sidebar: [
        { label: 'Get started', items: [{ autogenerate: { directory: 'start' } }] },
        { label: 'Self-hosting', items: [{ autogenerate: { directory: 'self-hosting' } }] },
        { label: 'Features', items: [{ autogenerate: { directory: 'features' } }] },
        { label: 'Security and privacy', items: [{ autogenerate: { directory: 'security' } }] },
        { label: 'Federation', items: [{ autogenerate: { directory: 'federation' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
      ],
    }),
  ],
});
