/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
      },
      colors: {
        background: '#0C0C0C',
        surface: '#141414',
        stroke: '#2a2a2a',
        accent: '#E8FF47',
        'accent-2': '#A8FF3E',
        muted: '#888888',
      },
    },
  },
  plugins: [],
}
