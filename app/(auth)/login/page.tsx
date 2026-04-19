import { Suspense } from "react";
import { AuthPage } from "@/src/features/auth/AuthPage";

export default function LoginPage(): React.JSX.Element {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AuthPage />
    </Suspense>
  );
}
