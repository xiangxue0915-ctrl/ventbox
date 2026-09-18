/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0) rotate(0deg)' },
          '15%': { transform: 'translateX(-12px) rotate(-7deg)' },
          '30%': { transform: 'translateX(12px) rotate(7deg)' },
          '45%': { transform: 'translateX(-9px) rotate(-4deg)' },
          '60%': { transform: 'translateX(9px) rotate(4deg)' },
          '75%': { transform: 'translateX(-4px) rotate(-2deg)' },
        },
        pop: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.25)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        shake: 'shake 0.5s ease-in-out',
        pop: 'pop 0.3s ease-in-out',
      },
    },
  },
  plugins: [],
};
