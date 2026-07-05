/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // "Freight Terminal" celeste palette, ported from public/assets/css/styles.css.
        celeste: {
          50: '#eef7fb',
          100: '#d6ebf5',
          200: '#aed7ea',
          300: '#7dbcda',
          400: '#4f9fc7',
          500: '#2f83ad',
          600: '#236a8f',
          700: '#1d5674',
          800: '#1a4860',
          900: '#193d52',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
