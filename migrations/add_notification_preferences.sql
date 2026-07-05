-- Migration: Add notification_preferences JSONB column to user_settings
-- Run this once against your Supabase / PostgreSQL database.
-- Safe to run multiple times (IF NOT EXISTS guard).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT NULL;
