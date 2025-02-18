/*
  Warnings:

  - Added the required column `description` to the `CalendarEventCreated` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endTime` to the `CalendarEventCreated` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `CalendarEventCreated` table without a default value. This is not possible if the table is not empty.
  - Added the required column `summary` to the `CalendarEventCreated` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timeZone` to the `CalendarEventCreated` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CalendarEventCreated" ADD COLUMN     "attendees" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "description" TEXT DEFAULT '',
ADD COLUMN     "endTime" TEXT DEFAULT '',
ADD COLUMN     "startTime" TEXT DEFAULT '',
ADD COLUMN     "summary" TEXT DEFAULT '',
ADD COLUMN     "timeZone" TEXT DEFAULT '';

-- Update any existing rows to have empty values
UPDATE "CalendarEventCreated" SET
  "description" = '',
  "endTime" = '',
  "startTime" = '',
  "summary" = '',
  "timeZone" = '',
  "attendees" = ARRAY[]::TEXT[]
WHERE "description" IS NULL
  OR "endTime" IS NULL
  OR "startTime" IS NULL
  OR "summary" IS NULL
  OR "timeZone" IS NULL
  OR "attendees" IS NULL;
