-- Migration: Add last_seen column to users table
-- Run this script once on your MySQL database

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS last_seen DATETIME NULL DEFAULT NULL COMMENT 'Last time user was seen online';

-- Verify
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'last_seen';
