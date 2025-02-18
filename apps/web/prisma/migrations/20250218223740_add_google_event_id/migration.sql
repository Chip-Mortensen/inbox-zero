/*
  Warnings:

  - Added the required column `googleEventId` to the `CalendarEventCreated` table without a default value. This is not possible if the table is not empty.
  - Made the column `description` on table `CalendarEventCreated` required. This step will fail if there are existing NULL values in that column.
  - Made the column `endTime` on table `CalendarEventCreated` required. This step will fail if there are existing NULL values in that column.
  - Made the column `startTime` on table `CalendarEventCreated` required. This step will fail if there are existing NULL values in that column.
  - Made the column `summary` on table `CalendarEventCreated` required. This step will fail if there are existing NULL values in that column.
  - Made the column `timeZone` on table `CalendarEventCreated` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "CalendarEventCreated" ADD COLUMN     "googleEventId" TEXT DEFAULT 'legacy',
ALTER COLUMN "attendees" DROP DEFAULT,
ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "description" DROP DEFAULT,
ALTER COLUMN "endTime" SET NOT NULL,
ALTER COLUMN "endTime" DROP DEFAULT,
ALTER COLUMN "startTime" SET NOT NULL,
ALTER COLUMN "startTime" DROP DEFAULT,
ALTER COLUMN "summary" SET NOT NULL,
ALTER COLUMN "summary" DROP DEFAULT,
ALTER COLUMN "timeZone" SET NOT NULL,
ALTER COLUMN "timeZone" DROP DEFAULT;

-- Make the column required after setting default values
ALTER TABLE "CalendarEventCreated" ALTER COLUMN "googleEventId" SET NOT NULL;
