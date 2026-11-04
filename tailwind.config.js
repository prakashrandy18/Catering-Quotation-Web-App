/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // `brand` follows the user-configurable brand colour via CSS variables (set in src/lib/theme.ts)
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          dark: 'rgb(var(--brand-dark) / <alpha-value>)',
          soft: 'rgb(var(--brand-soft) / <alpha-value>)',
          tint: 'rgb(var(--brand-tint) / <alpha-value>)',
        },
        ink: { DEFAULT: '#1c1f1a', muted: '#4d5348', faint: '#6b7166' },
        paper: { DEFAULT: '#FBFBF9', card: '#FFFFFF', sunk: '#F5F5F3', line: '#E3E3DF', strong: '#8c9186' },
        warn: { DEFAULT: '#7A4B00', soft: '#FFF1D6' },
        danger: { DEFAULT: '#A1281A', soft: '#FBE4E1' },
        whatsapp: '#177A42',
      },
      fontFamily: {
        display: ['Poppins', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: { xl2: '18px' },
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
    },
  },
  plugins: [],
};
