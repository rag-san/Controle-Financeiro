import { AppOnboarding } from "@/components/layout/AppOnboarding";

export default function ProtectedLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      <AppOnboarding />
      {children}
    </>
  );
}


