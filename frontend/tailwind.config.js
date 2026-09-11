/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: 'var(--color-paper)',
          2: 'var(--color-paper-2)',
          subtle: 'var(--color-paper-subtle)',
        },
        ink: {
          DEFAULT: 'var(--color-ink)',
          2: 'var(--color-ink-2)',
          muted: 'var(--color-ink-muted)',
          faint: 'var(--color-ink-faint)',
        },
        rule: {
          DEFAULT: 'var(--color-rule)',
          subtle: 'var(--color-rule-subtle)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          light: 'var(--color-accent-light)',
        },
        emergency: {
          DEFAULT: 'var(--color-emergency)',
          hover: 'var(--color-emergency-hover)',
          light: 'var(--color-emergency-light)',
        },
        operational: {
          DEFAULT: 'var(--color-operational)',
          hover: 'var(--color-operational-hover)',
          light: 'var(--color-operational-light)',
        },
        amber: {
          DEFAULT: 'var(--color-amber)',
          hover: 'var(--color-amber-hover)',
          light: 'var(--color-amber-light)',
        },
        specialty: {
          DEFAULT: 'var(--color-specialty)',
          light: 'var(--color-specialty-light)',
        },
        clinical: {
          950: '#090d16',
          900: '#111827',
          850: '#151f30',
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
        },
        pulse: {
          500: '#10b981',
          400: '#34d399',
          300: '#6ee7b7',
          glow: 'rgba(16, 185, 129, 0.25)',
        }
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        sans: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      boxShadow: {
        hairline: 'var(--shadow-hairline)',
        card: 'var(--shadow-card)',
        dropdown: 'var(--shadow-dropdown)',
        modal: 'var(--shadow-modal)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        pill: 'var(--radius-pill)',
      },
      animation: {
        'radar-sweep': 'radarSweep 6s linear infinite',
        'pulse-gentle': 'pulseGentle 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      },
      keyframes: {
        radarSweep: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        pulseGentle: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.78', transform: 'scale(1.05)' },
        }
      }
    },
  },
  plugins: [],
}

