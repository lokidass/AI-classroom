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
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Define the join classroom schema
const joinClassroomSchema = z.object({
  code: z.string().min(1, "Class code is required"),
});

type JoinClassroomProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClassroomJoined: () => void;
};

export default function JoinClassroomDialog({
  open,
  onOpenChange,
  onClassroomJoined,
}: JoinClassroomProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Create form
  const form = useForm<z.infer<typeof joinClassroomSchema>>({
    resolver: zodResolver(joinClassroomSchema),
    defaultValues: {
      code: "",
    },
  });

  // Join classroom mutation
  const joinClassroomMutation = useMutation({
    mutationFn: async (data: z.infer<typeof joinClassroomSchema>) => {
      return await apiRequest("POST", "/api/classrooms/join", data);
    },
    onSuccess: (response) => {
      toast({
        title: "Classroom joined",
        description: "You have successfully joined the classroom.",
      });
      form.reset();
      onOpenChange(false);
      onClassroomJoined();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to join classroom",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Form submission handler
  const onSubmit = (data: z.infer<typeof joinClassroomSchema>) => {
    joinClassroomMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Join a Classroom</DialogTitle>
          <DialogDescription>
            Enter the class code provided by your teacher to join a classroom.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Class Code</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter class code" 
                      {...field} 
                      className="font-mono text-center text-lg"
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
                disabled={joinClassroomMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={joinClassroomMutation.isPending}
              >
                {joinClassroomMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Joining...
                  </>
                ) : (
                  "Join Classroom"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
