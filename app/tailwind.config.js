/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f0f14',
          light: '#15151c',
          lighter: '#1c1c26',
        },
        accent: {
          DEFAULT: '#d97706',
          light: '#f59e0b',
          dim: 'rgba(217, 119, 6, 0.15)',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.06)',
          light: 'rgba(255, 255, 255, 0.10)',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
