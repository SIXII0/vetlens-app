export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fef7f2',
          100: '#fde9db',
          200: '#fad2b5',
          300: '#f5b58a',
          400: '#ed965c',
          500: '#e07b3c',
          600: '#c4652e',
          700: '#9e4f25',
          800: '#7c3d1e',
          900: '#5c2e18',
        },
        warm: {
          50:  '#fafaf9',
          100: '#f5f3f0',
          200: '#e8e4df',
          300: '#d6d0c8',
          400: '#b8b0a6',
          500: '#8c857c',
          600: '#6b655e',
          700: '#524d47',
          800: '#3d3934',
          900: '#2d2a26',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        'xs':  ['0.8125rem', { lineHeight: '1.25rem' }],
        'sm':  ['0.875rem', { lineHeight: '1.375rem' }],
        'base':['0.9375rem', { lineHeight: '1.5rem' }],
        'lg':  ['1.0625rem', { lineHeight: '1.625rem' }],
        'xl':  ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '1.875rem' }],
      },
      borderRadius: {
        'xl': '0.75rem', '2xl': '1rem', '3xl': '1.25rem',
      },
      boxShadow: {
        'card': '0 2px 8px rgb(0 0 0 / 0.06)',
        'raised': '0 4px 16px rgb(0 0 0 / 0.1)',
      },
      animation: {
        'enter': 'enter .25s ease-out',
      },
      keyframes: {
        enter: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    }
  }
};
