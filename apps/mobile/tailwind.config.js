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
        'surface-hover': rgbVar('surface-hover'),
        'composer-border': rgbVar('composer-border'),
        'composer-placeholder': rgbVar('composer-placeholder'),
        'user-bubble': rgbVar('user-bubble'),
        'user-bubble-border': rgbVar('user-bubble-border'),
        primary: rgbVar('primary'),
        'primary-pressed': rgbVar('primary-pressed'),
        'primary-foreground': rgbVar('primary-foreground'),
        'subtle-pressed': rgbVar('subtle-pressed'),
        secondary: rgbVar('secondary'),
        muted: rgbVar('muted'),
        link: rgbVar('link'),
        /** 批准/拒绝：Tailwind 名保留，CSS 变量为 bg 语义（--approval = approvalBg） */
        approval: rgbVar('approval'),
        'approval-text': rgbVar('approval-text'),
        rejection: rgbVar('rejection'),
        'rejection-text': rgbVar('rejection-text'),
        'rejection-border': rgbVar('rejection-border'),
        'rejection-border-pressed': rgbVar('rejection-border-pressed'),
        warning: rgbVar('warning'),
        danger: rgbVar('danger'),
        destructive: rgbVar('danger'),
        border: rgbVar('border'),
        terminal: rgbVar('terminal-bg'),
        'terminal-header': rgbVar('terminal-header-bg'),
        'terminal-fg': rgbVar('terminal-fg'),
        'terminal-muted': rgbVar('terminal-muted'),
        'terminal-accent': rgbVar('terminal-accent'),
        'overlay-scrim': 'rgba(0,0,0,0.4)',
      },
      borderRadius: {
        control: '8px',
        panel: '12px',
        bubble: '22px',
        sheet: '14px',
        attachment: '10px',
        sheetTop: '20px',
      },
      fontFamily: {
        mono: ['SpaceMono', 'monospace'],
      },
    },
  },
  plugins: [],
};
