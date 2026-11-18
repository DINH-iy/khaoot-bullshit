-- Chips earned by playing (points, place, wins, arcade). A new value of its own; PostgreSQL can only use a new enum
-- value after the transaction that adds it, so its rules follow in the next migration.
-- AlterEnum
ALTER TYPE "ChipReason" ADD VALUE 'EARNED';
