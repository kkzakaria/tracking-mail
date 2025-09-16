# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 application called "tracking-mail" built with React 19, TypeScript, and Tailwind CSS v4. The project uses Turbopack for development and includes Supabase for backend services.

## Development Commands

### Core Development
- `pnpm dev` - Start development server with Turbopack
- `pnpm build` - Build production application with Turbopack
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint for code quality

### Supabase Local Development
- `supabase start` - Start local Supabase stack (requires Docker)
- `supabase stop` - Stop local Supabase services
- `supabase db reset` - Reset local database with migrations and seeds
- `supabase db push` - Push schema changes to local database
- `supabase functions serve` - Serve edge functions locally
- `supabase gen types typescript --local` - Generate TypeScript types from database schema

Local Supabase URLs:
- API: http://127.0.0.1:8001
- Studio: http://127.0.0.1:8003
- Database: postgresql://postgres:postgres@127.0.0.1:8002/postgres
- Inbucket (email testing): http://127.0.0.1:8004

## Architecture & Structure

### Frontend Architecture
- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **UI Components**: Shadcn/ui design system (New York style) with Lucide icons
- **Typography**: Geist font family (sans and mono variants)
- **Build Tool**: Turbopack for fast development and builds

### Key Directories
- `app/` - Next.js App Router pages and layouts
- `lib/` - Utility functions and shared logic
- `components/` - React components (following Shadcn/ui structure)
- `supabase/` - Database migrations, edge functions, and local config
- `public/` - Static assets

### Styling System
- Uses Tailwind CSS v4 with custom color system based on OKLCH color space
- CSS variables for theme management (light/dark mode support)
- Sidebar color scheme variables pre-configured
- Custom radius values and chart color palette included

### Database & Backend
- **Supabase**: PostgreSQL database with real-time subscriptions
- **Authentication**: Supabase Auth with JWT tokens
- **Storage**: File storage with 50MB limit
- **Edge Functions**: Deno runtime for serverless functions
- **Local Development**: Full Supabase stack runs locally via Docker

### Development Tools
- **TypeScript**: Strict mode enabled with Next.js plugin
- **ESLint**: Next.js and TypeScript rules configured
- **PostCSS**: Tailwind CSS processing
- **VS Code**: Deno extension recommended for edge functions

## Code Conventions

### Path Aliases
The project uses TypeScript path mapping:
- `@/*` maps to root directory
- `@/components` for UI components
- `@/lib` for utilities
- `@/hooks` for custom React hooks

### Utility Functions
- `cn()` function in `lib/utils.ts` combines clsx and tailwind-merge for conditional CSS classes
- Follow Shadcn/ui patterns for component composition

### Component Structure
- UI components should follow Shadcn/ui patterns
- Use `cn()` for conditional styling
- Implement proper TypeScript interfaces
- Support both light and dark themes via CSS variables

## Environment Setup

### Required Environment Variables
- Database and auth settings handled by Supabase local config
- Optional: `OPENAI_API_KEY` for Supabase AI features in Studio
- SMS/Email providers require additional API keys (see supabase/config.toml)

### Local Development Prerequisites
- Node.js with pnpm
- Docker (for Supabase local development)
- Supabase CLI installed globally

## Testing & Quality

### Code Quality
- ESLint configuration includes Next.js and TypeScript rules
- Strict TypeScript configuration
- Import/export patterns follow ES modules

### Database
- Migrations enabled with schema validation
- Seed data can be loaded via `./seed.sql`
- Local database resets preserve migration history

### Deployment
- Optimized for Vercel deployment
- Static assets served from `public/`
- Build artifacts excluded from version control