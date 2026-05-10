import type { Config } from 'tailwindcss';

const config: Config = {
  // preflight is OFF — the FileMind custom CSS in globals.css owns the global reset.
  // Tailwind only emits utility classes that opt-in components can use.
  corePlugins: { preflight: false },

  darkMode: 'class',

  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],

  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border-hsl))',
        input: 'hsl(var(--input-hsl))',
        ring: 'hsl(var(--ring-hsl))',
        background: 'hsl(var(--background-hsl))',
        foreground: 'hsl(var(--foreground-hsl))',
        primary: {
          DEFAULT: 'hsl(var(--primary-hsl))',
          foreground: 'hsl(var(--primary-foreground-hsl))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary-hsl))',
          foreground: 'hsl(var(--secondary-foreground-hsl))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive-hsl))',
          foreground: 'hsl(var(--destructive-foreground-hsl))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted-hsl))',
          foreground: 'hsl(var(--muted-foreground-hsl))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent-hsl))',
          foreground: 'hsl(var(--accent-foreground-hsl))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover-hsl))',
          foreground: 'hsl(var(--popover-foreground-hsl))',
        },
      },
      keyframes: {
        'fade-in-0': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-out-0': { from: { opacity: '1' }, to: { opacity: '0' } },
        'zoom-in-95': { from: { transform: 'scale(0.95)' }, to: { transform: 'scale(1)' } },
        'zoom-out-95': { from: { transform: 'scale(1)' }, to: { transform: 'scale(0.95)' } },
      },
    },
  },

  plugins: [require('tailwindcss-animate')],
};

export default config;
