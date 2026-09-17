/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Taggify brand orange — matches the accent in the TAGGIFY wordmark
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        // Near-black neutrals from the logo lockup
        slate: {
          750: '#293548',
          850: '#161d2b',
          950: '#0a0a0b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px -4px rgba(15, 23, 42, 0.06)',
        'card': '0 1px 2px rgba(0, 0, 0, 0.28)',
        'glow': '0 4px 14px -4px rgba(249, 115, 22, 0.45)',
        'tooltip': '0 4px 16px -2px rgba(0, 0, 0, 0.22)',
      },
      keyframes: {
        'tooltip-in': {
          from: { opacity: '0', transform: 'translateY(2px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'tooltip-in': 'tooltip-in 120ms ease-out',
      },
    },
  },
  plugins: [],
}
