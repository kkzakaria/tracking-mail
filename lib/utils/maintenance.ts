import { TokenStorage, AuthAttemptLogger } from '../services/supabase-client';

/**
 * Maintenance utilities for Microsoft Graph authentication system
 */

export interface MaintenanceStats {
  tokensCleanedUp: number;
  authAttemptsCleanedUp: number;
  activeTokens: number;
  recentFailedAttempts: number;
  errors: string[];
}

/**
 * Perform system maintenance tasks
 */
export async function performMaintenance(): Promise<MaintenanceStats> {
  const stats: MaintenanceStats = {
    tokensCleanedUp: 0,
    authAttemptsCleanedUp: 0,
    activeTokens: 0,
    recentFailedAttempts: 0,
    errors: []
  };

  try {
    // Cleanup expired tokens
    stats.tokensCleanedUp = await TokenStorage.cleanupExpiredTokens();
  } catch (error) {
    stats.errors.push(`Token cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  try {
    // Cleanup old auth attempts (older than 30 days)
    stats.authAttemptsCleanedUp = await AuthAttemptLogger.cleanupOldAttempts(30);
  } catch (error) {
    stats.errors.push(`Auth attempts cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  try {
    // Get recent failed attempts count for monitoring
    stats.recentFailedAttempts = await AuthAttemptLogger.getRecentFailedAttempts('0.0.0.0', 60); // Last hour
  } catch (error) {
    stats.errors.push(`Failed attempts check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return stats;
}

/**
 * Validate system health
 */
export async function checkSystemHealth(): Promise<{
  healthy: boolean;
  issues: string[];
  metrics: Record<string, number>;
}> {
  const issues: string[] = [];
  const metrics: Record<string, number> = {};

  try {
    // Check if required environment variables are set
    const requiredEnvVars = [
      'MICROSOFT_CLIENT_ID',
      'MICROSOFT_CLIENT_SECRET',
      'ENCRYPTION_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];

    requiredEnvVars.forEach(envVar => {
      if (!process.env[envVar]) {
        issues.push(`Missing required environment variable: ${envVar}`);
      }
    });

    // Check encryption key length
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (encryptionKey && encryptionKey.length < 32) {
      issues.push('Encryption key should be at least 32 characters long');
    }

    // Test database connectivity
    try {
      const { checkDatabaseConnection } = await import('../services/supabase-client');
      const dbConnected = await checkDatabaseConnection();
      if (!dbConnected) {
        issues.push('Database connection failed');
      }
      metrics.databaseConnected = dbConnected ? 1 : 0;
    } catch (error) {
      issues.push(`Database health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      metrics.databaseConnected = 0;
    }

    // Test Microsoft Graph service configuration
    try {
      const { AdminGraphService } = await import('../services/admin-graph-service');
      const adminService = AdminGraphService.getInstance();
      const serviceStatus = await adminService.getServiceStatus();
      const configValidation = {
        isValid: serviceStatus.success && serviceStatus.data?.isConfigured,
        errors: serviceStatus.success ? [] : [serviceStatus.error?.message || 'Service not available']
      };
      if (!configValidation.isValid) {
        issues.push(...configValidation.errors);
      }
      metrics.graphConfigValid = configValidation.isValid ? 1 : 0;
    } catch (error) {
      issues.push(`Microsoft Graph configuration check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      metrics.graphConfigValid = 0;
    }

    return {
      healthy: issues.length === 0,
      issues,
      metrics
    };

  } catch (error) {
    return {
      healthy: false,
      issues: [`System health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      metrics: {}
    };
  }
}

/**
 * Generate system status report
 */
export async function generateStatusReport(): Promise<{
  timestamp: string;
  health: Awaited<ReturnType<typeof checkSystemHealth>>;
  maintenance: MaintenanceStats;
  recommendations: string[];
}> {
  const timestamp = new Date().toISOString();
  const health = await checkSystemHealth();
  const maintenance = await performMaintenance();

  const recommendations: string[] = [];

  // Generate recommendations based on findings
  if (maintenance.recentFailedAttempts > 10) {
    recommendations.push('High number of recent failed authentication attempts detected. Consider reviewing security logs.');
  }

  if (maintenance.tokensCleanedUp > 100) {
    recommendations.push('Large number of expired tokens cleaned up. Consider reviewing token refresh logic.');
  }

  if (maintenance.errors.length > 0) {
    recommendations.push('Maintenance tasks encountered errors. Review logs for details.');
  }

  if (!health.healthy) {
    recommendations.push('System health issues detected. Address the issues listed in the health report.');
  }

  if (maintenance.authAttemptsCleanedUp === 0) {
    recommendations.push('No old auth attempts were cleaned up. Verify cleanup functionality.');
  }

  return {
    timestamp,
    health,
    maintenance,
    recommendations
  };
}

/**
 * Create maintenance API endpoint handler
 */
export function createMaintenanceHandler() {
  return async function(request: Request) {
    // Verify authorization (you might want to add proper admin authentication)
    const authHeader = request.headers.get('Authorization');
    const expectedToken = process.env.MAINTENANCE_TOKEN;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    try {
      const url = new URL(request.url);
      const action = url.searchParams.get('action') || 'status';

      switch (action) {
        case 'status':
          const report = await generateStatusReport();
          return new Response(JSON.stringify(report, null, 2), {
            headers: { 'Content-Type': 'application/json' }
          });

        case 'maintenance':
          const maintenanceResult = await performMaintenance();
          return new Response(JSON.stringify(maintenanceResult, null, 2), {
            headers: { 'Content-Type': 'application/json' }
          });

        case 'health':
          const healthResult = await checkSystemHealth();
          return new Response(JSON.stringify(healthResult, null, 2), {
            headers: { 'Content-Type': 'application/json' }
          });

        default:
          return new Response(
            JSON.stringify({ error: 'Invalid action' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }
          );
      }
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  };
}

/**
 * Schedule maintenance tasks (for use with cron jobs or background tasks)
 */
export async function scheduledMaintenance(): Promise<void> {
  try {
    console.log('Starting scheduled maintenance...');

    const stats = await performMaintenance();

    console.log('Maintenance completed:', {
      tokensCleanedUp: stats.tokensCleanedUp,
      authAttemptsCleanedUp: stats.authAttemptsCleanedUp,
      errors: stats.errors
    });

    // Log errors if any
    if (stats.errors.length > 0) {
      console.error('Maintenance errors:', stats.errors);
    }

    // You could send notifications here if needed
    // await sendMaintenanceNotification(stats);

  } catch (error) {
    console.error('Scheduled maintenance failed:', error);
    // You could send error notifications here
    // await sendErrorNotification(error);
  }
}

/**
 * Backup system configuration (for disaster recovery)
 */
export async function backupConfiguration(): Promise<{
  timestamp: string;
  configuration: Record<string, unknown>;
}> {
  return {
    timestamp: new Date().toISOString(),
    configuration: {
      // Don't include sensitive values in backups
      hasClientId: !!process.env.MICROSOFT_CLIENT_ID,
      hasClientSecret: !!process.env.MICROSOFT_CLIENT_SECRET,
      tenantId: process.env.MICROSOFT_TENANT_ID,
      redirectUri: process.env.MICROSOFT_REDIRECT_URI,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
      encryptionKeyLength: process.env.ENCRYPTION_KEY?.length || 0,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseKeys: !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
      nodeEnv: process.env.NODE_ENV
    }
  };
}