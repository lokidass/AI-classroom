import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, 
  DialogHeader, DialogTitle 
} from "@/components/ui/dialog";
import { 
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Define the classroom schema
const classroomSchema = z.object({
  name: z.string().min(1, "Classroom name is required"),
  description: z.string().optional(),
  code: z.string().optional(),
});

type CreateClassroomProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClassroomCreated: () => void;
};

export default function CreateClassroomDialog({
  open,
  onOpenChange,
  onClassroomCreated,
}: CreateClassroomProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Create form
  const form = useForm<z.infer<typeof classroomSchema>>({
    resolver: zodResolver(classroomSchema),
    defaultValues: {
      name: "",
      description: "",
      code: "",
    },
  });

  // Create classroom mutation
  const createClassroomMutation = useMutation({
    mutationFn: async (data: z.infer<typeof classroomSchema>) => {
      return await apiRequest("POST", "/api/classrooms", data);
    },
    onSuccess: () => {
      toast({
        title: "Classroom created",
        description: "Your classroom has been created successfully.",
      });
      form.reset();
      onOpenChange(false);
      onClassroomCreated();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create classroom",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Form submission handler
  const onSubmit = (data: z.infer<typeof classroomSchema>) => {
    createClassroomMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create a New Classroom</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new virtual classroom.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Classroom Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter classroom name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Enter a description for your classroom"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Class Code (Optional)
                  </FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Leave blank to generate automatically"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="mt-6">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={createClassroomMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createClassroomMutation.isPending}
              >
                {createClassroomMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Classroom"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
