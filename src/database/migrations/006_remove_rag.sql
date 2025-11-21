-- Remove RAG Implementation
-- This migration removes the non-functional RAG (Retrieval Augmented Generation) implementation
-- Created: 2025-11-17

-- ============= DROP RAG OBJECTS =============

-- Drop statistics
DROP STATISTICS IF EXISTS conv_embeddings_context_stats;

-- Drop conversation_embeddings table (CASCADE removes all dependent indexes and triggers)
DROP TABLE IF EXISTS conversation_embeddings CASCADE;

-- Drop the trigger function for conversation_embeddings
DROP FUNCTION IF EXISTS update_conversation_embeddings_updated_at() CASCADE;

-- Record this migration
INSERT INTO migrations (name) VALUES ('006_remove_rag')
ON CONFLICT (name) DO NOTHING;
