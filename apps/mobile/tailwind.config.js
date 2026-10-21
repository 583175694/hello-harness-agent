/** @type {import('tailwindcss').Config} */
function rgbVar(name) {
  return `rgb(var(--${name}) / <alpha-value>)`;
}

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: rgbVar('canvas'),
        drawer: rgbVar('drawer'),
        surface: rgbVar('surface'),
        subtle: rgbVar('subtle'),
        'composer-border': rgbVar('composer-border'),
        'user-bubble': rgbVar('user-bubble'),
        'user-bubble-border': rgbVar('user-bubble-border'),
        primary: rgbVar('primary'),
        'primary-pressed': rgbVar('primary-pressed'),
        'primary-foreground': rgbVar('primary-foreground'),
        'subtle-pressed': rgbVar('subtle-pressed'),
        secondary: rgbVar('secondary'),
        muted: rgbVar('muted'),
        link: rgbVar('link'),
        approval: rgbVar('approval'),
        'approval-text': rgbVar('approval-text'),
        rejection: rgbVar('rejection'),
        'rejection-text': rgbVar('rejection-text'),
        border: rgbVar('border'),
        terminal: '#0f1115',
        'overlay-scrim': 'rgba(0,0,0,0.4)',
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
