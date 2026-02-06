import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Brand colors for Vistrial - #A2A2FD (light) & #5400FF (dark)
        brand: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a2a2fd",  // Primary light - #A2A2FD
          500: "#7c5cff",
          600: "#5400ff",  // Primary dark - #5400FF
          700: "#4500d6",
          800: "#3900ad",
          900: "#2d0085",
          950: "#1a004d",
        },
        // Convenient aliases for primary brand colors
        vistrial: {
          light: "#a2a2fd",
          DEFAULT: "#5400ff",
          dark: "#4500d6",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        // Enhanced shadows for depth
        'xs': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'inner-border': 'inset 0 0 0 1px rgb(255 255 255 / 0.1)',
        'ring-brand': '0 0 0 2px rgb(84 0 255 / 0.2)',
        'ring-brand-lg': '0 0 0 4px rgb(84 0 255 / 0.15)',
        // 3D button effects
        'btn-3d': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2), inset 0 -2px 0 0 rgba(0, 0, 0, 0.1)',
        'btn-3d-pressed': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.15)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "slide-in-from-top": {
          from: { transform: "translateY(-10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "slide-in-from-bottom": {
          from: { transform: "translateY(10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "fade-out": "fade-out 0.2s ease-out",
        "slide-in-from-top": "slide-in-from-top 0.2s ease-out",
        "slide-in-from-bottom": "slide-in-from-bottom 0.2s ease-out",
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #a2a2fd 0%, #5400ff 100%)',
        'brand-gradient-reverse': 'linear-gradient(135deg, #5400ff 0%, #a2a2fd 100%)',
        'brand-gradient-subtle': 'linear-gradient(135deg, rgba(162, 162, 253, 0.1) 0%, rgba(84, 0, 255, 0.1) 100%)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
