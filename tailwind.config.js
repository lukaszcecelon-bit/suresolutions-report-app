/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sure: {
          blue: '#3D70B2',
          dark: '#1F2937',
        },
      },
    },
  },
  plugins: [],
}
