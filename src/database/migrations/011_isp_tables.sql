-- ISP Support Bot Tables
-- Tables for storing customer data queries and API response analytics

-- ISP queries table for caching and analytics
CREATE TABLE IF NOT EXISTS isp_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_phone VARCHAR(20) NOT NULL,
    context_id VARCHAR(100) NOT NULL,
    query_type VARCHAR(20) NOT NULL CHECK (query_type IN ('customer_info', 'usage_status', 'account_details', 'connection_info')),
    customer_id VARCHAR(50),
    phone_number VARCHAR(20),
    query_description TEXT NOT NULL,
    api_response JSONB NOT NULL,
    response_time_ms INTEGER NOT NULL,
    query_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_isp_queries_user_phone ON isp_queries(user_phone);
CREATE INDEX IF NOT EXISTS idx_isp_queries_context_id ON isp_queries(context_id);
CREATE INDEX IF NOT EXISTS idx_isp_queries_query_type ON isp_queries(query_type);
CREATE INDEX IF NOT EXISTS idx_isp_queries_customer_id ON isp_queries(customer_id);
CREATE INDEX IF NOT EXISTS idx_isp_queries_phone_number ON isp_queries(phone_number);
CREATE INDEX IF NOT EXISTS idx_isp_queries_query_date ON isp_queries(query_date);
CREATE INDEX IF NOT EXISTS idx_isp_queries_created_at ON isp_queries(created_at);