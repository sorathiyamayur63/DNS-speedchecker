/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 20px 80px rgba(15, 23, 42, 0.14)',
      },
    },
  },
  darkMode: 'class',
  plugins: [],
}
