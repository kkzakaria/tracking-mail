-- Create Microsoft authentication related tables

-- Users table for storing Microsoft Graph user information
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    microsoft_id VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    mail VARCHAR(255),
    user_principal_name VARCHAR(255),
    given_name VARCHAR(255),
    surname VARCHAR(255),
    job_title VARCHAR(255),
    department VARCHAR(255),
    business_phones TEXT[], -- Array of phone numbers
    mobile_phone VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Microsoft tokens table for storing encrypted tokens
CREATE TABLE IF NOT EXISTS microsoft_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL, -- Microsoft user ID
    access_token TEXT NOT NULL, -- Encrypted access token
    refresh_token TEXT, -- Encrypted refresh token (optional)
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scope TEXT NOT NULL,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Authentication attempts for security logging
CREATE TABLE IF NOT EXISTS auth_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255), -- Microsoft user ID (optional, may be null for failed attempts)
    ip_address INET NOT NULL,
    user_agent TEXT,
    attempt_type VARCHAR(50) NOT NULL, -- 'login', 'refresh', 'logout'
    success BOOLEAN NOT NULL,
    error_code VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions for tracking active sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL, -- Microsoft user ID
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_microsoft_id ON users(microsoft_id);
CREATE INDEX IF NOT EXISTS idx_users_mail ON users(mail);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

CREATE INDEX IF NOT EXISTS idx_microsoft_tokens_user_id ON microsoft_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_microsoft_tokens_expires_at ON microsoft_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_microsoft_tokens_revoked ON microsoft_tokens(is_revoked);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_user_id ON auth_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_address ON auth_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_created_at ON auth_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_success ON auth_attempts(success);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);

-- Add RLS (Row Level Security) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE microsoft_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (auth.uid()::text = microsoft_id);

CREATE POLICY "Service role can manage all users" ON users
    FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for microsoft_tokens table (only service role access)
CREATE POLICY "Only service role can access tokens" ON microsoft_tokens
    FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for auth_attempts table (only service role access)
CREATE POLICY "Only service role can access auth attempts" ON auth_attempts
    FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for user_sessions table
CREATE POLICY "Users can view their own sessions" ON user_sessions
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Service role can manage all sessions" ON user_sessions
    FOR ALL USING (auth.role() = 'service_role');

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_microsoft_tokens_updated_at BEFORE UPDATE ON microsoft_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to cleanup expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM microsoft_tokens
    WHERE expires_at < NOW() OR is_revoked = true;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old authentication attempts
CREATE OR REPLACE FUNCTION cleanup_old_auth_attempts(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM auth_attempts
    WHERE created_at < NOW() - INTERVAL '1 day' * days_old;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions
    WHERE expires_at < NOW() OR is_active = false;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user with active token
CREATE OR REPLACE FUNCTION get_user_with_active_token(microsoft_user_id TEXT)
RETURNS TABLE (
    user_data JSONB,
    token_data JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        to_jsonb(u.*) as user_data,
        to_jsonb(t.*) as token_data
    FROM users u
    LEFT JOIN microsoft_tokens t ON u.microsoft_id = t.user_id
    WHERE u.microsoft_id = microsoft_user_id
    AND u.is_active = true
    AND (t.id IS NULL OR (t.expires_at > NOW() AND t.is_revoked = false))
    ORDER BY t.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE users IS 'Stores Microsoft Graph user information';
COMMENT ON TABLE microsoft_tokens IS 'Stores encrypted Microsoft Graph tokens';
COMMENT ON TABLE auth_attempts IS 'Logs authentication attempts for security monitoring';
COMMENT ON TABLE user_sessions IS 'Tracks active user sessions';

COMMENT ON FUNCTION cleanup_expired_tokens() IS 'Removes expired and revoked tokens';
COMMENT ON FUNCTION cleanup_old_auth_attempts(INTEGER) IS 'Removes old authentication attempt logs';
COMMENT ON FUNCTION cleanup_expired_sessions() IS 'Removes expired user sessions';
COMMENT ON FUNCTION get_user_with_active_token(TEXT) IS 'Gets user information with their active token';