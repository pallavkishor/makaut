const tokens = require('../../design-tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Identical palette to the student app on purpose: one brand, one hue.
      // The admin panel used to be purple; it now differentiates itself with a
      // denser layout rather than a different colour. See ../../design-tokens.js.
      colors: tokens.colors,
      borderColor: {
        DEFAULT: tokens.colors.border.DEFAULT,
      },
      ringOffsetColor: {
        DEFAULT: tokens.colors.background.DEFAULT,
      },
    },
  },
  plugins: [],
};
