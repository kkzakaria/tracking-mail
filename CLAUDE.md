# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Email tracking application built with Next.js 15, React 19, TypeScript, and Tailwind CSS v4. Integrates with Microsoft Graph API for mailbox access and uses Supabase for backend services including authentication and data storage.

## Development Commands

### Core Development
- `pnpm dev` - Start development server with Turbopack
- `pnpm build` - Build production application with Turbopack
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint for code quality
- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm type-check` - Run TypeScript type checking
- `pnpm type-check:watch` - Watch mode for type checking
- `pnpm check-all` - Run both type checking and linting
- `pnpm ci` - Full CI check: type-check, lint, and build

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

### Microsoft Graph Integration
The application integrates with Microsoft Graph API for email tracking:
- **Configuration**: `lib/config/microsoft-graph.ts` - API endpoints and permission scopes
- **Service Layer**: `lib/services/microsoft-graph.ts` - Core Graph API client
- **Admin Service**: `lib/services/admin-graph-service.ts` - Administrative mailbox operations
- **Authentication**: OAuth 2.0 flow with client credentials for application permissions
- **Encryption**: Sensitive tokens stored encrypted in Supabase using AES-256

### Authentication Flow
Two-tier authentication system:
1. **Supabase Auth**: Primary user authentication and session management
2. **Microsoft Graph**: OAuth integration for mailbox access with encrypted token storage

Key authentication files:
- `lib/services/user-auth-service.ts` - User authentication service layer
- `lib/services/auth-service.ts` - Microsoft Graph authentication
- `lib/middleware/auth-middleware.ts` - Route protection middleware
- `lib/hooks/use-auth.ts` - React hook for auth state

### Database Schema
Supabase migrations in `supabase/migrations/`:
- User profiles with admin role support
- Microsoft authentication tokens (encrypted)
- Row Level Security (RLS) policies for data isolation

### API Routes
- `/api/auth/microsoft/callback` - OAuth callback handler
- `/api/admin/*` - Admin-only endpoints for mailbox management
- Protected routes require authentication via middleware

## Code Conventions

### Path Aliases
- `@/*` maps to root directory
- `@/components` - React components
- `@/lib` - Utilities and services
- `@/hooks` - Custom React hooks

### Service Architecture
- Services in `lib/services/` handle business logic
- Hooks in `lib/hooks/` provide React integration
- Utils in `lib/utils/` for shared utilities
- Middleware in `lib/middleware/` for request processing

### TypeScript Patterns
- Strict mode enabled with comprehensive type checking
- Interfaces defined in `lib/types/`
- Type-safe Supabase client with generated types

## Environment Setup

### Required Environment Variables
```
# Microsoft Graph Configuration
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_TENANT_ID=your-tenant-id-or-common
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/microsoft/callback

# Encryption
ENCRYPTION_KEY=your-32-character-or-longer-encryption-key

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### Git Hooks
Pre-commit hooks via Husky and lint-staged:
- Auto-runs ESLint fixes on staged files
- Formats JSON, Markdown, and YAML files with Prettier

## Testing & Quality

### Code Quality Tools
- ESLint with Next.js and TypeScript rules
- TypeScript strict mode with additional checks
- Husky pre-commit hooks for automated checks

### Development Workflow
1. Start local Supabase: `supabase start`
2. Run development server: `pnpm dev`
3. Access app at http://localhost:3000
4. View database at http://127.0.0.1:8003

### Deployment
- Optimized for Vercel deployment
- Environment variables required for production
- Database migrations auto-applied on Supabase