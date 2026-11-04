import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
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
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        subsurface: 'var(--bg-subsurface)',
        'subtle-border': 'var(--border-subtle)',
        'focus-border': 'var(--border-focus)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
      },
    },
  },
  plugins: [],
};
export default config;
