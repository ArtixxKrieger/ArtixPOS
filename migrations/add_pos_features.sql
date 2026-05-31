-- Migration: Add pos_features JSONB column to user_settings
-- Run this once against your Supabase / PostgreSQL database.
-- Safe to run multiple times (IF NOT EXISTS guard).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS pos_features JSONB DEFAULT NULL;
