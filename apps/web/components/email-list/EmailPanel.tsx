import { XIcon } from "lucide-react";
import { ActionButtons } from "@/components/ActionButtons";
import { Tooltip } from "@/components/Tooltip";
import type { Thread } from "@/components/email-list/types";
import { Button } from "@/components/ui/button";
import { PlanExplanation } from "@/components/email-list/PlanExplanation";
import { useIsInAiQueue } from "@/store/ai-queue";
import { EmailThread } from "@/components/email-list/EmailThread";

export function EmailPanel({
  row,
  isCategorizing,
  onPlanAiAction,
  onAiCategorize,
  onArchive,
  close,
  executingPlan,
  rejectingPlan,
  executePlan,
  rejectPlan,
  refetch,
}: {
  row: Thread;
  isCategorizing: boolean;
  onPlanAiAction: (thread: Thread) => void;
  onAiCategorize: (thread: Thread) => void;
  onArchive: (thread: Thread) => void;
  close: () => void;

  executingPlan: boolean;
  rejectingPlan: boolean;
  executePlan: (thread: Thread) => Promise<void>;
  rejectPlan: (thread: Thread) => Promise<void>;
  refetch: () => void;
}) {
  const isPlanning = useIsInAiQueue(row.id);

  const lastMessage = row.messages?.[row.messages.length - 1];

  const plan = row.plan;

  return (
    <div className="flex h-full flex-col overflow-y-hidden border-l border-l-gray-100">
      <div className="sticky border-b border-b-gray-100 p-4 md:flex md:items-center md:justify-between">
        <div className="md:w-0 md:flex-1">
          <h1
            id="message-heading"
            className="text-lg font-medium text-gray-900"
          >
            {lastMessage.headers.subject}
          </h1>
          <p className="mt-1 truncate text-sm text-gray-500">
            {lastMessage.headers.from}
          </p>
        </div>

        <div className="mt-3 flex items-center md:ml-2 md:mt-0">
          <ActionButtons
            threadId={row.id!}
            isPlanning={isPlanning}
            isCategorizing={isCategorizing}
            onPlanAiAction={() => onPlanAiAction(row)}
            onAiCategorize={() => onAiCategorize(row)}
            onArchive={() => {
              onArchive(row);
              close();
            }}
            refetch={refetch}
          />
          <Tooltip content="Close">
            <Button onClick={close} size="icon" variant="ghost">
              <span className="sr-only">Close</span>
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        {plan?.rule && (
          <PlanExplanation
            thread={row}
            executePlan={executePlan}
            rejectPlan={rejectPlan}
            executingPlan={executingPlan}
            rejectingPlan={rejectingPlan}
          />
        )}
        <EmailThread
          messages={row.messages}
          refetch={refetch}
          showReplyButton
        />
      </div>
    </div>
  );
}
