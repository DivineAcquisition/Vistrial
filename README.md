# Vistrial

A comprehensive business automation platform for SMS marketing, voice drops, workflow automation, and customer management.

## Features

- **Contact Management**: Import, organize, and manage customer contacts with tags and custom fields
- **SMS Marketing**: Send personalized SMS campaigns with template variables
- **Voice Drops**: AI-powered voice messages using ElevenLabs text-to-speech
- **Workflow Automation**: Create multi-step automated sequences triggered by events
- **Booking System**: Embeddable booking widget for customer appointments
- **Quote Management**: Create, send, and track quotes with customer acceptance
- **Usage-Based Billing**: Credit system with Stripe integration for pay-as-you-go messaging
- **Multi-Organization**: Support for teams and organizations with role-based access

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org) (App Router)
- **Database**: [Supabase](https://supabase.com) (PostgreSQL + Auth + Storage)
- **Payments**: [Stripe](https://stripe.com) (Subscriptions + Usage Billing)
- **SMS/Voice**: [Telnyx](https://telnyx.com) / [Twilio](https://twilio.com)
- **Voice AI**: [ElevenLabs](https://elevenlabs.io)
- **Styling**: [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- **Deployment**: [Vercel](https://vercel.com)

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or pnpm
- Supabase account
- Stripe account (for billing features)
- Telnyx or Twilio account (for messaging)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/your-org/vistrial.git
cd vistrial
```

2. Install dependencies:

```bash
npm install
```

3. Copy the environment file and configure:

```bash
cp .env.local.example .env.local
```

4. Configure your environment variables (see [Environment Variables](#environment-variables))

5. Set up the database:

```bash
# If using Supabase CLI for local development
supabase start
supabase db push

# Or apply migrations to your cloud project
supabase link --project-ref your-project-ref
supabase db push
```

6. Start the development server:

```bash
npm run dev
```

7. Visit [http://localhost:3000](http://localhost:3000)

## Environment Variables

See `.env.example` for all required environment variables. Key configurations:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `TELNYX_API_KEY` | Telnyx API key for SMS/Voice |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for voice synthesis |
| `CRON_SECRET` | Secret for authenticating cron job endpoints |

## Project Structure

```
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/            # Authentication pages
│   │   ├── (dashboard)/       # Protected dashboard pages
│   │   ├── api/               # API routes
│   │   └── book/              # Public booking pages
│   ├── components/            # React components
│   │   ├── ui/               # shadcn/ui components
│   │   ├── auth/             # Authentication components
│   │   ├── contacts/         # Contact management
│   │   ├── workflows/        # Workflow components
│   │   └── settings/         # Settings components
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Utility libraries
│   │   ├── supabase/         # Supabase clients
│   │   ├── stripe/           # Stripe integration
│   │   └── services/         # Business logic services
│   ├── types/                 # TypeScript types
│   └── constants/             # Application constants
├── supabase/
│   ├── migrations/           # Database migrations
│   ├── templates/            # Email templates
│   └── config.toml           # Local Supabase config
└── public/                    # Static assets
```

## Database Schema

The database includes the following main tables:

- `organizations` - Multi-tenant organization data
- `user_profiles` - Extended user information
- `organization_memberships` - User-organization relationships
- `contacts` - Customer contact information
- `workflows` - Automated workflow definitions
- `workflow_enrollments` - Active workflow instances
- `messages` - SMS and voice message logs
- `quotes` - Quote/estimate management
- `bookings` - Appointment bookings
- `credit_balances` - Usage credit tracking
- `transactions` - Billing transaction history

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Configure environment variables in Vercel Dashboard
4. Deploy!

The `vercel.json` includes:
- Cron job configurations for background tasks
- Function timeout settings
- CORS headers for API routes
- Security headers

### Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the migrations in `supabase/migrations/`
3. Configure authentication providers in the dashboard
4. Set up Row Level Security policies

### Stripe Setup

1. Create products and prices in Stripe Dashboard
2. Set up webhooks pointing to `/api/webhooks/stripe`
3. Configure the price IDs in environment variables

## Cron Jobs

The following background jobs run on Vercel:

| Job | Schedule | Description |
|-----|----------|-------------|
| `process-workflows` | Every 5 min | Process workflow step transitions |
| `send-messages` | Every 2 min | Send queued SMS and voice messages |
| `check-balances` | Every 15 min | Auto-refill low credit balances |
| `follow-ups` | Daily 9 AM | Process daily follow-up tasks |
| `reminders` | Hourly | Send appointment reminders |
| `quote-followups` | Daily 10 AM | Follow up on pending quotes |

## Development

### Running Tests

```bash
npm run test
```

### Linting

```bash
npm run lint
```

### Type Checking

```bash
npm run type-check
```

### Building for Production

```bash
npm run build
```

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run linting and tests
4. Submit a pull request

## License

Proprietary - All rights reserved.

## Support

For support, please contact [support@vistrial.io](mailto:support@vistrial.io)
