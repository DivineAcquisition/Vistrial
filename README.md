# Vistrial

A modern React component library for building beautiful interfaces. Built with Next.js, TypeScript, Tailwind CSS, and Radix UI primitives.

## Getting Started

1. Install the dependencies:

```bash
pnpm install
```

2. Start the development server:

```bash
pnpm run dev
```

3. Visit [http://localhost:3000](http://localhost:3000) in your browser.

## Components

Vistrial includes a comprehensive set of UI components:

### Form Components
- **Button** - Primary, secondary, light, ghost, and destructive variants
- **Input** - Text input with search and password variants
- **Checkbox** - Checkbox with indeterminate state support
- **Switch** - Toggle switch with multiple sizes
- **Select** - Custom select dropdown
- **RadioCard** - Radio button cards for selection
- **Label** - Form labels
- **Searchbar** - Search input component

### Display Components
- **Badge** - Status badges (default, neutral, success, error, warning)
- **Card** - Container cards with dark mode support
- **Table** - Data tables with header, body, row components
- **ProgressBar** - Horizontal progress indicator
- **ProgressCircle** - Circular progress indicator
- **LineChart** - Line charts with legends and tooltips
- **Divider** - Horizontal dividers

### Overlay Components
- **Dialog** - Modal dialogs
- **Drawer** - Slide-out drawer panels
- **Dropdown** - Dropdown menus with submenus
- **Popover** - Popover containers
- **Tooltip** - Tooltips with arrow indicators

### Navigation
- **TabNavigation** - Tab-based navigation
- **CommandBar** - Command palette

### Date & Time
- **Calendar** - Calendar for date selection
- **DatePicker** - Single date and date range picker with time support

## Tech Stack

- [Next.js 14](https://nextjs.org) - React framework
- [TypeScript](https://www.typescriptlang.org) - Type safety
- [Tailwind CSS](https://tailwindcss.com) - Utility-first CSS
- [Radix UI](https://www.radix-ui.com) - Headless UI primitives
- [Recharts](https://recharts.org) - Chart library
- [tailwind-variants](https://www.tailwind-variants.org) - Variant management

## Project Structure

```
src/
├── app/                 # Next.js app router
│   ├── layout.tsx      # Root layout
│   ├── page.tsx        # Home page
│   └── siteConfig.ts   # Site configuration
├── components/         # Vistrial UI components
│   ├── Badge.tsx
│   ├── Button.tsx
│   ├── Calendar.tsx
│   ├── Card.tsx
│   ├── Checkbox.tsx
│   ├── DatePicker.tsx
│   ├── Dialog.tsx
│   ├── Divider.tsx
│   ├── Drawer.tsx
│   ├── Dropdown.tsx
│   ├── Input.tsx
│   ├── Label.tsx
│   ├── LineChart.tsx
│   ├── Popover.tsx
│   ├── ProgressBar.tsx
│   ├── ProgressCircle.tsx
│   ├── RadioCard.tsx
│   ├── Searchbar.tsx
│   ├── Select.tsx
│   ├── Switch.tsx
│   ├── Table.tsx
│   ├── TabNavigation.tsx
│   └── Tooltip.tsx
└── lib/                # Utilities
    ├── chartUtils.ts   # Chart helpers
    ├── utils.ts        # General utilities
    └── useOnWindowResize.tsx
```

## License

See [LICENSE.md](./LICENSE.md) for details.
