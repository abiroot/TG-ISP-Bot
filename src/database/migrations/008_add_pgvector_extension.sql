-- Migration: Add pgvector extension and conversation_embeddings table
-- Purpose: Enable semantic search for conversation history using vector embeddings
-- Date: 2025-01-14

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create conversation_embeddings table for storing embedded conversation chunks
CREATE TABLE IF NOT EXISTS conversation_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_id VARCHAR(255) NOT NULL,
    context_type VARCHAR(50) NOT NULL CHECK (context_type IN ('group', 'private')),
    chunk_text TEXT NOT NULL,
    embedding vector(1536) NOT NULL, -- OpenAI text-embedding-3-small dimension
    message_ids TEXT[] NOT NULL, -- Array of message IDs included in this chunk
    chunk_index INTEGER NOT NULL, -- Sequence number of chunk in conversation
    timestamp_start TIMESTAMP NOT NULL, -- Start time of first message in chunk
    timestamp_end TIMESTAMP NOT NULL, -- End time of last message in chunk
    metadata JSONB DEFAULT '{}', -- Additional metadata (topics, entities, sentiment, etc.)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure chunk ordering is unique per context
    UNIQUE(context_id, chunk_index)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_context_id ON conversation_embeddings(context_id);
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_context_type ON conversation_embeddings(context_type);
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_timestamp_start ON conversation_embeddings(timestamp_start);
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_timestamp_end ON conversation_embeddings(timestamp_end);

-- Create HNSW index for fast vector similarity search (cosine distance)
-- This is the key index for RAG performance
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_embedding_cosine ON conversation_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Alternative: IVFFlat index (faster build, slightly slower search)
-- Uncomment if HNSW is too slow to build for your dataset
-- CREATE INDEX idx_conv_embeddings_embedding_ivfflat ON conversation_embeddings
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);

-- Create GIN index on metadata for efficient filtering
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_metadata ON conversation_embeddings USING GIN (metadata);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_conversation_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_conversation_embeddings_timestamp ON conversation_embeddings;
CREATE TRIGGER trigger_update_conversation_embeddings_timestamp
    BEFORE UPDATE ON conversation_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_embeddings_updated_at();

-- Add comments for documentation
COMMENT ON TABLE conversation_embeddings IS 'Stores vector embeddings of conversation chunks for semantic search and RAG';
COMMENT ON COLUMN conversation_embeddings.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions)';
COMMENT ON COLUMN conversation_embeddings.chunk_text IS 'Concatenated text of messages in this chunk';
COMMENT ON COLUMN conversation_embeddings.message_ids IS 'Array of message IDs from messages table';
COMMENT ON COLUMN conversation_embeddings.metadata IS 'JSONB field for topics, entities, sentiment, etc.';

-- Create statistics for query planner optimization
DROP STATISTICS IF EXISTS conv_embeddings_context_stats;
CREATE STATISTICS conv_embeddings_context_stats ON context_id, context_type FROM conversation_embeddings;
