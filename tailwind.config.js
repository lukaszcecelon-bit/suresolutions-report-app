/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // `class` strategy: dark mode activates when <html class="dark"> is present.
  // ThemeProvider (src/components/common/ThemeContext.jsx) toggles it manually,
  // respecting `prefers-color-scheme: dark` on first visit then persisting in
  // localStorage. An inline script in index.html applies the class before React
  // hydrates to prevent a flash of the wrong theme.
  darkMode: 'class',
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
