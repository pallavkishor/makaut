const tokens = require('../../design-tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // Shared brand palette. See ../../design-tokens.js for the measured
      // contrast ratios behind each step. Status hues (red / amber / green /
      // emerald) intentionally stay on the Tailwind defaults so destructive
      // and warning affordances never read as brand sage.
      colors: tokens.colors,
      borderColor: {
        // Bare `border` picks up the brand divider colour.
        DEFAULT: tokens.colors.border.DEFAULT,
      },
      ringOffsetColor: {
        DEFAULT: tokens.colors.background.DEFAULT,
      },
    },
  },
  plugins: [],
};
