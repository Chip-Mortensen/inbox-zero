"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/utils";
import { format } from "date-fns";

const calendarEventFormSchema = z.object({
  summary: z.string().min(1, "Title is required"),
  description: z.string(),
  date: z.date(),
  startTime: z.string(),
  endTime: z.string(),
  attendees: z.string().optional(),
});

type CalendarEventFormValues = z.infer<typeof calendarEventFormSchema>;

interface CalendarEventFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: CalendarEventFormValues) => Promise<void>;
  initialValues: {
    summary: string;
    description: string;
    startTime: string;
    endTime: string;
    date: Date;
    attendees?: string[];
  };
  isEditMode?: boolean;
}

export function CalendarEventForm({
  isOpen,
  onClose,
  onSubmit,
  initialValues,
  isEditMode = false,
}: CalendarEventFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<CalendarEventFormValues>({
    resolver: zodResolver(calendarEventFormSchema),
    defaultValues: {
      summary: initialValues.summary,
      description: initialValues.description,
      date: initialValues.date,
      startTime: initialValues.startTime,
      endTime: initialValues.endTime,
      attendees: initialValues.attendees?.join(", "),
    },
  });

  const selectedDate = watch("date");

  const handleFormSubmit = async (data: CalendarEventFormValues) => {
    await onSubmit(data);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Modify Calendar Event" : "Create Calendar Event"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <Input
            type="text"
            name="summary"
            label="Title"
            registerProps={register("summary", { required: true })}
            error={errors.summary}
          />
          <Input
            type="text"
            autosizeTextarea
            rows={3}
            name="description"
            label="Description"
            registerProps={register("description")}
            error={errors.description}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium">Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? (
                    format(selectedDate, "PPP")
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setValue("date", date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              type="time"
              name="startTime"
              label="Start Time"
              registerProps={register("startTime", { required: true })}
              error={errors.startTime}
            />
            <Input
              type="time"
              name="endTime"
              label="End Time"
              registerProps={register("endTime", { required: true })}
              error={errors.endTime}
            />
          </div>
          <Input
            type="text"
            name="attendees"
            label="Attendees (comma-separated emails)"
            registerProps={register("attendees")}
            error={errors.attendees}
          />
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {isEditMode ? "Update Event" : "Create Event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
