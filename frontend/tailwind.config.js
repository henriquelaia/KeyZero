/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#7C3AED',
          light:   '#A78BFA',
          dark:    '#5B21B6',
        },
      },
    },
  },
  plugins: [],
};
