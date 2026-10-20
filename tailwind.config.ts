import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        synqo: {
          obsidian: '#090A0F',
          slate: '#131722',
          surface: '#1A1F2C',
          border: '#232A3B',
          cobalt: '#0052FF',
          'cobalt-hover': '#0043D4',
          cyan: '#00D2FF',
          chalk: '#F8FAFC',
          muted: '#94A3B8',
        },
        background: 'var(--background)',
        foreground: 'var(--foreground)',
      },
    },
  },
  plugins: [],
};
export default config;

