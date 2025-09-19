# Migration Guide: Graph Services Refactoring

## Overview

This guide helps you migrate from the old monolithic services to the new modular Microsoft Graph services architecture. The refactoring maintains backward compatibility while providing a cleaner, more maintainable structure.

## Architecture Changes

### Before (Monolithic)
```
AdminGraphService (1094 lines) - Everything in one class
MailboxStatsService (816 lines) - Specialized stats
QuickStatsService (72 lines) - Quick estimates
```

### After (Modular)
```
Core Services (Infrastructure):
├── GraphConfigService - Configuration management
├── GraphTokenService - Token handling
├── GraphRateLimitService - Rate limiting & retry
└── GraphClientFactory - Client creation

Domain Services (Business Logic):
├── GraphUserService - User operations
├── GraphMailboxService - Mailbox operations & stats
├── GraphMailSenderService - Email sending
└── GraphStatsService - Statistics & quick estimates

Facade:
└── AdminGraphService - Maintains backward compatibility
```

## Migration Path

### Phase 1: Immediate (No Code Changes Required)

The new `AdminGraphService` facade maintains 100% backward compatibility. **Existing code continues to work without changes.**

```typescript
// This continues to work exactly as before
const adminService = AdminGraphService.getInstance();
const result = await adminService.getOrganizationStats();
```

### Phase 2: Gradual Migration (Recommended)

Migrate to specialized services for better performance and features:

#### 1. Replace MailboxStatsService

**Before:**
```typescript
import { MailboxStatsService } from '@/lib/services/mailbox-stats-service';

const stats = await MailboxStatsService.getMailboxStatsForPeriod(
  'user@example.com',
  { startDate: '2024-01-01', endDate: '2024-01-31' }
);
```

**After:**
```typescript
import { GraphMailboxService } from '@/lib/services/graph';

const mailboxService = GraphMailboxService.getInstance();

// Enhanced with unanswered message detection
const stats = await mailboxService.getMailboxPeriodStats(
  'user@example.com',
  {
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    includeUnanswered: true,
    includeUnansweredSample: true,
    includeFolders: true
  }
);
```

#### 2. Replace QuickStatsService

**Before:**
```typescript
import { QuickStatsService } from '@/lib/services/quick-stats-service';

const quickStats = await QuickStatsService.getQuickStats('user@example.com');
```

**After:**
```typescript
import { GraphStatsService } from '@/lib/services/graph';

const statsService = GraphStatsService.getInstance();

// Intelligent estimates with multiple fallback strategies
const quickStats = await statsService.getQuickStats('user@example.com', {
  useEstimates: false, // Try real data first
  fallbackToDefaults: true // Fallback to estimates if needed
});
```

#### 3. Use Specialized Services Directly

**User Operations:**
```typescript
import { GraphUserService } from '@/lib/services/graph';

const userService = GraphUserService.getInstance();
const users = await userService.getAllUsers({
  accountEnabled: true,
  department: 'IT'
});
```

**Email Sending:**
```typescript
import { GraphMailSenderService } from '@/lib/services/graph';

const senderService = GraphMailSenderService.getInstance();
const result = await senderService.sendMailAsUser(
  'sender@example.com',
  {
    subject: 'Test',
    body: 'Hello World',
    toRecipients: ['recipient@example.com'],
    isHtml: true
  }
);
```

## New Features Available After Migration

### 1. Advanced Mailbox Statistics

```typescript
const mailboxService = GraphMailboxService.getInstance();

// Get comprehensive period statistics with unanswered message detection
const periodStats = await mailboxService.getMailboxPeriodStats(emailAddress, {
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  includeUnanswered: true,        // Detect messages without replies
  includeUnansweredSample: true,  // Get sample of unanswered messages
  includeFolders: true,           // Include per-folder statistics
  onlyUserFolders: true,          // Exclude system folders
  quick: false                    // Full analysis vs quick estimation
});

// Result includes:
// - totalMessages, unreadMessages, readMessages
// - unansweredMessages, answeredMessages (NEW)
// - sampleUnanswered with message details (NEW)
// - folders with per-folder statistics
// - summary with response rates and period analysis
```

### 2. Intelligent Quick Statistics

```typescript
const statsService = GraphStatsService.getInstance();

// Multiple estimation strategies
const quickStats = await statsService.getQuickStats(emailAddress, {
  useEstimates: false,        // Try cached data first
  fallbackToDefaults: true    // Use defaults if no data
});

// Estimation strategies (automatic fallback):
// 1. Recent cache data (< 1 hour) with real message counts
// 2. Intelligent estimates based on historical data and domain patterns
// 3. Default estimates (compatible with old QuickStatsService)
```

### 3. Enhanced Error Handling

All services now use `GraphOperationResult<T>` with consistent error handling:

```typescript
const result = await service.someOperation();

if (!result.success) {
  console.error(`Error ${result.error?.code}: ${result.error?.message}`);
  return;
}

const data = result.data; // Type-safe data access
```

### 4. Rate Limiting & Retry Logic

Built-in exponential backoff with jitter:

```typescript
// Automatic retry with intelligent backoff
const result = await rateLimitService.executeWithRetry(
  () => graphApiCall(),
  {
    maxRetries: 3,
    timeout: 10000,
    backoffMultiplier: 2
  }
);
```

## Breaking Changes (Only if migrating away from facade)

### 1. Return Type Changes

**Before:**
```typescript
// Old services returned various formats
const stats = await MailboxStatsService.getStats(); // Custom format
```

**After:**
```typescript
// All services use GraphOperationResult<T>
const result = await service.getStats();
if (result.success) {
  const stats = result.data;
}
```

### 2. Method Signature Changes

**Before:**
```typescript
await MailboxStatsService.getMailboxStatsForPeriod(email, options);
```

**After:**
```typescript
// More specific method names and enhanced options
await mailboxService.getMailboxPeriodStats(email, {
  ...options,
  includeUnanswered: true,
  includeUnansweredSample: true
});
```

## Migration Strategies

### Strategy 1: Gradual (Recommended)

1. **Keep existing code working** - No immediate changes required
2. **New features use new services** - Start using specialized services for new functionality
3. **Gradual replacement** - Replace old service calls during regular maintenance
4. **Remove old services** - After all code is migrated

### Strategy 2: Big Bang

1. **Replace all imports** - Update all import statements at once
2. **Update method calls** - Adapt to new method signatures
3. **Test thoroughly** - Ensure all functionality works
4. **Remove old services** - Clean up unused files

### Strategy 3: Hybrid

1. **Critical paths first** - Migrate performance-critical code immediately
2. **Keep stable code** - Leave working non-critical code unchanged
3. **Opportunistic migration** - Migrate when making other changes

## Compatibility Matrix

| Old Service | New Service | Backward Compatible | Enhanced Features |
|-------------|-------------|-------------------|-------------------|
| AdminGraphService | AdminGraphService (facade) | ✅ 100% | ⚠️ Same API |
| MailboxStatsService | GraphMailboxService | ❌ API changes | ✅ Unanswered detection |
| QuickStatsService | GraphStatsService | ❌ API changes | ✅ Intelligent estimates |
| microsoft-graph.ts | Core services | ❌ Complete rewrite | ✅ Modular architecture |

## Testing Your Migration

### 1. Verify Backward Compatibility
```typescript
// Test that existing AdminGraphService calls still work
const adminService = AdminGraphService.getInstance();
const stats = await adminService.getOrganizationStats();
console.assert(stats.success, 'AdminGraphService should work');
```

### 2. Test New Features
```typescript
// Test enhanced mailbox statistics
const mailboxService = GraphMailboxService.getInstance();
const result = await mailboxService.getMailboxPeriodStats(testEmail, {
  includeUnanswered: true,
  includeUnansweredSample: true
});
console.assert(result.success && result.data?.unansweredMessages >= 0, 'Unanswered detection should work');
```

### 3. Performance Comparison
```typescript
// Compare performance between old and new approaches
const startTime = Date.now();
const quickStats = await GraphStatsService.getInstance().getQuickStats(testEmail);
const duration = Date.now() - startTime;
console.log(`Quick stats took ${duration}ms`);
```

## Rollback Strategy

If issues arise during migration:

### 1. Keep Old Files
Don't delete old service files until migration is complete and tested.

### 2. Feature Flags
```typescript
// Use environment variables to control service selection
const USE_NEW_SERVICES = process.env.USE_NEW_GRAPH_SERVICES === 'true';

const statsService = USE_NEW_SERVICES
  ? GraphStatsService.getInstance()
  : QuickStatsService;
```

### 3. A/B Testing
Deploy new services alongside old ones and gradually shift traffic.

## Support & Troubleshooting

### Common Issues

1. **Import Errors**
   ```typescript
   // ❌ Wrong
   import { GraphMailboxService } from '@/lib/services/graph-mailbox-service';

   // ✅ Correct
   import { GraphMailboxService } from '@/lib/services/graph';
   ```

2. **Type Errors**
   ```typescript
   // ❌ Wrong - assuming direct data access
   const stats = await service.getStats();
   console.log(stats.totalMessages);

   // ✅ Correct - check success first
   const result = await service.getStats();
   if (result.success) {
     console.log(result.data.totalMessages);
   }
   ```

3. **Performance Issues**
   ```typescript
   // ❌ Wrong - not leveraging quick mode
   const stats = await mailboxService.getMailboxPeriodStats(email, {});

   // ✅ Correct - use quick mode for fast estimates
   const stats = await mailboxService.getMailboxPeriodStats(email, { quick: true });
   ```

### Getting Help

1. **Check service health**:
   ```typescript
   const health = await getGraphServicesHealth();
   console.log('Services health:', health);
   ```

2. **Enable debug logging**:
   ```typescript
   // Services automatically log errors and performance metrics
   // Check console for [GraphService] prefixed messages
   ```

3. **Use initialization helper**:
   ```typescript
   const { success, services, error } = await initializeGraphServices();
   if (!success) {
     console.error('Service initialization failed:', error);
   }
   ```

## Timeline Recommendations

### Week 1-2: Assessment
- Inventory current usage of old services
- Identify critical paths and dependencies
- Plan migration order

### Week 3-4: New Feature Development
- Use new services for any new features
- Test compatibility and performance
- Train team on new architecture

### Week 5-8: Gradual Migration
- Migrate non-critical paths first
- Update one service area at a time
- Monitor for issues and performance

### Week 9-10: Final Migration
- Migrate remaining critical paths
- Remove old service files
- Update documentation and training

This migration can be done gradually with minimal risk thanks to the backward-compatible facade pattern. Start with new development and gradually migrate existing code as opportunities arise.