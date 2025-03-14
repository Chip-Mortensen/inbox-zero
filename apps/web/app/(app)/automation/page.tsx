import { Suspense } from "react";
import { redirect } from "next/navigation";
import { History } from "@/app/(app)/automation/History";
import { Pending } from "@/app/(app)/automation/Pending";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { Rules } from "@/app/(app)/automation/Rules";
import { Process } from "@/app/(app)/automation/Process";
import { Groups } from "@/app/(app)/automation/group/Groups";
import { RulesPrompt } from "@/app/(app)/automation/RulesPrompt";
import { OnboardingModal } from "@/components/OnboardingModal";
import { PermissionsCheck } from "@/app/(app)/PermissionsCheck";

export const maxDuration = 60; // Maximum allowed for Vercel hobby plan

export default async function AutomationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <Suspense>
      <PermissionsCheck />

      <Tabs defaultValue="prompt">
        <div className="content-container flex shrink-0 flex-col justify-between gap-x-4 space-y-2 border-b border-gray-200 bg-white py-2 shadow-sm md:flex-row md:gap-x-6 md:space-y-0">
          <div className="w-full overflow-x-auto">
            <TabsList>
              <TabsTrigger value="prompt">Prompt</TabsTrigger>
              <TabsTrigger value="rules">Rules</TabsTrigger>
              <TabsTrigger value="test">Test</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              {/* <TabsTrigger value="groups">Groups</TabsTrigger> */}
            </TabsList>
          </div>

          <OnboardingModal
            title="Getting started with AI Personal Assistant"
            description={
              <>
                Learn how to use the AI Personal Assistant to automatically
                label, archive, and more.
              </>
            }
            videoId="SoeNDVr7ve4"
          />
        </div>

        <TabsContent value="prompt" className="content-container mb-10">
          <RulesPrompt />
        </TabsContent>
        <TabsContent value="rules" className="content-container mb-10">
          <Rules />
        </TabsContent>
        <TabsContent value="test" className="content-container mb-10">
          <Process />
        </TabsContent>
        <TabsContent value="history" className="content-container mb-10">
          <History />
        </TabsContent>
        <TabsContent value="pending" className="content-container mb-10">
          <Pending />
        </TabsContent>
        {/* no longer in use */}
        <TabsContent value="groups" className="content-container mb-10">
          <Groups />
        </TabsContent>
      </Tabs>
    </Suspense>
  );
}
