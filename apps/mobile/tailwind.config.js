/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        canvas: '#f7f7f6',
        drawer: '#fbfaf9',
        surface: '#ffffff',
        subtle: '#f1f1ef',
        'composer-border': '#ededeb',
        'user-bubble': '#edf3fe',
        primary: '#171717',
        'primary-foreground': '#ffffff',
        secondary: '#555551',
        muted: '#898986',
        link: '#3f5f78',
        approval: '#eaf2ec',
        'approval-text': '#2f5d3a',
        rejection: '#f8ecea',
        'rejection-text': '#984b41',
        border: '#dededb',
        terminal: '#0f1115',
      },
      borderRadius: {
        control: '8px',
        panel: '12px',
        bubble: '22px',
      },
      fontFamily: {
        mono: ['SpaceMono', 'monospace'],
      },
    },
  },
  plugins: [],
};
