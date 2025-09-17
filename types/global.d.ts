declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.scss' {
  const content: string;
  export default content;
}

declare module '*.sass' {
  const content: string;
  export default content;
}

declare module '*.less' {
  const content: string;
  export default content;
}

declare module '*.styl' {
  const content: string;
  export default content;
}

// Environment variables with proper typing
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    MICROSOFT_CLIENT_ID?: string;
    MICROSOFT_CLIENT_SECRET?: string;
    MICROSOFT_TENANT_ID?: string;
    MICROSOFT_REDIRECT_URI?: string;
    NEXT_PUBLIC_APP_URL?: string;
    NEXTAUTH_SECRET?: string;
    NEXTAUTH_URL?: string;
    SUPABASE_URL?: string;
    NEXT_PUBLIC_SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    ENCRYPTION_KEY?: string;
    MAINTENANCE_TOKEN?: string;
  }
}