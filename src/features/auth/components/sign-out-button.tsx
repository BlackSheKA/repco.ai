"use client";

import { signOut } from "@/features/auth/actions/auth-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function SignOutButton() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Sign out
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of repco?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll need to sign in again to access your workspace.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay signed in</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => signOut()}>
            Sign out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
