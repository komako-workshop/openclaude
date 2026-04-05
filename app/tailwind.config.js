/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/streamdown/dist/*.js',
    './node_modules/@streamdown/code/dist/*.js',
    './node_modules/@streamdown/cjk/dist/*.js',
    './node_modules/@streamdown/math/dist/*.js',
    './node_modules/@streamdown/mermaid/dist/*.js',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--bg)',
        foreground: 'var(--fg)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-fg)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-fg)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-fg)',
        },
        border: {
          DEFAULT: 'var(--border)',
        },
        input: 'var(--input)',
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          foreground: 'var(--sidebar-fg)',
          accent: 'var(--sidebar-accent)',
          border: 'var(--sidebar-border)',
        },
        'user-bubble': {
          DEFAULT: 'var(--user-bubble)',
          foreground: 'var(--user-bubble-fg)',
        },
        destructive: 'var(--destructive)',
        success: 'var(--success)',
        warning: 'var(--warning)',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
