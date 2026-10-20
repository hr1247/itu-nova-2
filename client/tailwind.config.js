/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        itu: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc7fb',
          400: '#38a9f6',
          500: '#0e8de5',
          600: '#026fc4',
          700: '#03589f',
          800: '#074b83',
          900: '#0c3f6d',
          950: '#072849',
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'glow-itu': '0 0 25px -5px rgba(14, 141, 229, 0.4)',
        'glow-gold': '0 0 25px -5px rgba(245, 158, 11, 0.4)',
      }
    },
  },
  plugins: [],
}
