-- Create email tracking table for tracking email opens and responses
-- Following existing patterns with RLS policies and proper indexing

-- Email tracking table
CREATE TABLE IF NOT EXISTS email_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tracking_id VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL, -- References users.microsoft_id
    message_id VARCHAR(255), -- Microsoft Graph message ID
    conversation_id VARCHAR(255), -- For thread tracking
    recipient_email VARCHAR(255) NOT NULL,
    subject_hash VARCHAR(64), -- Hashed subject for privacy
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed')),
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    reply_detected_at TIMESTAMP WITH TIME ZONE,
    pixel_url VARCHAR(500), -- Tracking pixel URL
    tracking_links JSONB, -- Array of tracked links with their URLs
    metadata JSONB, -- Additional tracking metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email tracking events for detailed analytics
CREATE TABLE IF NOT EXISTS email_tracking_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tracking_id VARCHAR(255) NOT NULL REFERENCES email_tracking(tracking_id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'unsubscribed')),
    event_data JSONB, -- Event-specific data (link clicked, user agent, etc.)
    ip_address INET,
    user_agent TEXT,
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook subscriptions for real-time notifications
CREATE TABLE IF NOT EXISTS email_webhook_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL, -- References users.microsoft_id
    subscription_id VARCHAR(255) UNIQUE NOT NULL,
    resource_path VARCHAR(255) NOT NULL,
    notification_url VARCHAR(500) NOT NULL,
    expiration_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    last_renewal_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_tracking_tracking_id ON email_tracking(tracking_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_user_id ON email_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_message_id ON email_tracking(message_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_conversation_id ON email_tracking(conversation_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_recipient ON email_tracking(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_tracking_status ON email_tracking(status);
CREATE INDEX IF NOT EXISTS idx_email_tracking_sent_at ON email_tracking(sent_at);

CREATE INDEX IF NOT EXISTS idx_email_tracking_events_tracking_id ON email_tracking_events(tracking_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_events_type ON email_tracking_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_tracking_events_occurred_at ON email_tracking_events(occurred_at);

CREATE INDEX IF NOT EXISTS idx_email_webhook_subscriptions_user_id ON email_webhook_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_email_webhook_subscriptions_subscription_id ON email_webhook_subscriptions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_email_webhook_subscriptions_expiration ON email_webhook_subscriptions(expiration_datetime);
CREATE INDEX IF NOT EXISTS idx_email_webhook_subscriptions_active ON email_webhook_subscriptions(is_active);

-- Enable RLS (Row Level Security) following existing patterns
ALTER TABLE email_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_tracking table
CREATE POLICY "Users can view their own tracked emails" ON email_tracking
    FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert their own tracked emails" ON email_tracking
    FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update their own tracked emails" ON email_tracking
    FOR UPDATE USING (user_id = auth.uid()::text);

CREATE POLICY "Service role can manage all tracked emails" ON email_tracking
    FOR ALL USING (auth.role() = 'service_role');

-- Admin users can view all tracking data for management purposes
CREATE POLICY "Admin users can view all tracked emails" ON email_tracking
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id::text = auth.uid()::text
            AND user_profiles.role = 'admin'
        )
    );

-- RLS Policies for email_tracking_events table
CREATE POLICY "Users can view events for their tracked emails" ON email_tracking_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM email_tracking
            WHERE email_tracking.tracking_id = email_tracking_events.tracking_id
            AND email_tracking.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Service role can manage all tracking events" ON email_tracking_events
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admin users can view all tracking events" ON email_tracking_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id::text = auth.uid()::text
            AND user_profiles.role = 'admin'
        )
    );

-- RLS Policies for email_webhook_subscriptions table
CREATE POLICY "Users can manage their own webhook subscriptions" ON email_webhook_subscriptions
    FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Service role can manage all webhook subscriptions" ON email_webhook_subscriptions
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admin users can view all webhook subscriptions" ON email_webhook_subscriptions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id::text = auth.uid()::text
            AND user_profiles.role = 'admin'
        )
    );

-- Add trigger for updating the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_email_tracking_updated_at
    BEFORE UPDATE ON email_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_webhook_subscriptions_updated_at
    BEFORE UPDATE ON email_webhook_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create a function to generate unique tracking IDs
CREATE OR REPLACE FUNCTION generate_tracking_id() RETURNS TEXT AS $$
BEGIN
    RETURN 'track_' || encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Create a function to clean up old tracking data
CREATE OR REPLACE FUNCTION cleanup_old_tracking_data(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM email_tracking_events
    WHERE occurred_at < NOW() - INTERVAL '1 day' * days_to_keep;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    DELETE FROM email_tracking
    WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON email_tracking TO authenticated;
GRANT ALL ON email_tracking_events TO authenticated;
GRANT ALL ON email_webhook_subscriptions TO authenticated;
GRANT EXECUTE ON FUNCTION generate_tracking_id() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_tracking_data(INTEGER) TO service_role;