/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: {
            950: '#060b14', // Deep dark page background
            900: '#0a0f1a', // Terminal and card surface background
          },
          slate: {
            50: '#f4f6fb',  // Main light mode background
          },
          charcoal: '#0d1117', // Deep text color for light mode
        }
      }
    },
  },
  plugins: [],
}
