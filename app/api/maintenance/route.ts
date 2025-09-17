import { NextRequest, NextResponse } from 'next/server';
import {
  performMaintenance,
  checkSystemHealth,
  generateStatusReport,
  backupConfiguration
} from '@/lib/utils/maintenance';

/**
 * GET /api/maintenance
 * System maintenance and health check endpoint
 */
export async function GET(request: NextRequest) {
  try {
    // Simple authentication check
    const authHeader = request.headers.get('Authorization');
    const expectedToken = process.env.MAINTENANCE_TOKEN;

    // In production, use proper admin authentication
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'status';

    switch (action) {
      case 'status':
        const report = await generateStatusReport();
        return NextResponse.json(report);

      case 'health':
        const healthResult = await checkSystemHealth();
        return NextResponse.json(healthResult);

      case 'maintenance':
        const maintenanceResult = await performMaintenance();
        return NextResponse.json(maintenanceResult);

      case 'backup':
        const backupResult = await backupConfiguration();
        return NextResponse.json(backupResult);

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: status, health, maintenance, backup' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Maintenance endpoint error:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/maintenance
 * Trigger maintenance tasks
 */
export async function POST(request: NextRequest) {
  try {
    // Simple authentication check
    const authHeader = request.headers.get('Authorization');
    const expectedToken = process.env.MAINTENANCE_TOKEN;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'cleanup':
        const cleanupResult = await performMaintenance();
        return NextResponse.json({
          success: true,
          message: 'Cleanup completed',
          result: cleanupResult
        });

      case 'health-check':
        const healthResult = await checkSystemHealth();
        return NextResponse.json({
          success: true,
          message: 'Health check completed',
          result: healthResult
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: cleanup, health-check' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Maintenance POST endpoint error:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}