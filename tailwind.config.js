import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        navy: {
          950: '#050c1a',
          900: '#0a1628',
          800: '#0f1f3a',
          700: '#15294b',
          600: '#1d3762',
        },
        electric: {
          300: '#8ccbff',
          400: '#4ea8ff',
          500: '#1e88ff',
          600: '#0b6df0',
          700: '#0a57c4',
        },
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseBar: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.5s ease-out both',
        'pulse-bar': 'pulseBar 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
