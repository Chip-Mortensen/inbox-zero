-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "Action" DROP CONSTRAINT "Action_ruleId_fkey";

-- DropForeignKey
ALTER TABLE "ApiKey" DROP CONSTRAINT "ApiKey_userId_fkey";

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_userId_fkey";

-- DropForeignKey
ALTER TABLE "ColdEmail" DROP CONSTRAINT "ColdEmail_userId_fkey";

-- DropForeignKey
ALTER TABLE "EmailToken" DROP CONSTRAINT "EmailToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "ExecutedAction" DROP CONSTRAINT "ExecutedAction_executedRuleId_fkey";

-- DropForeignKey
ALTER TABLE "ExecutedRule" DROP CONSTRAINT "ExecutedRule_ruleId_fkey";

-- DropForeignKey
ALTER TABLE "ExecutedRule" DROP CONSTRAINT "ExecutedRule_userId_fkey";

-- DropForeignKey
ALTER TABLE "Group" DROP CONSTRAINT "Group_userId_fkey";

-- DropForeignKey
ALTER TABLE "GroupItem" DROP CONSTRAINT "GroupItem_groupId_fkey";

-- DropForeignKey
ALTER TABLE "Label" DROP CONSTRAINT "Label_userId_fkey";

-- DropForeignKey
ALTER TABLE "Newsletter" DROP CONSTRAINT "Newsletter_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Newsletter" DROP CONSTRAINT "Newsletter_userId_fkey";

-- DropForeignKey
ALTER TABLE "PromptHistory" DROP CONSTRAINT "PromptHistory_userId_fkey";

-- DropForeignKey
ALTER TABLE "Rule" DROP CONSTRAINT "Rule_groupId_fkey";

-- DropForeignKey
ALTER TABLE "Rule" DROP CONSTRAINT "Rule_userId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "ThreadTracker" DROP CONSTRAINT "ThreadTracker_ruleId_fkey";

-- DropForeignKey
ALTER TABLE "ThreadTracker" DROP CONSTRAINT "ThreadTracker_userId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_premiumAdminId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_premiumId_fkey";

-- DropForeignKey
ALTER TABLE "_CategoryToRule" DROP CONSTRAINT "_CategoryToRule_A_fkey";

-- DropForeignKey
ALTER TABLE "_CategoryToRule" DROP CONSTRAINT "_CategoryToRule_B_fkey";

-- CreateTable
CREATE TABLE "CalendarEventCreated" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventCreated_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEventCreated_userId_idx" ON "CalendarEventCreated"("userId");

-- CreateIndex
CREATE INDEX "CalendarEventCreated_threadId_idx" ON "CalendarEventCreated"("threadId");

-- CreateIndex
CREATE INDEX "CalendarEventCreated_messageId_idx" ON "CalendarEventCreated"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventCreated_userId_threadId_messageId_key" ON "CalendarEventCreated"("userId", "threadId", "messageId");
