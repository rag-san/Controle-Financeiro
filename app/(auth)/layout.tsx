export default function AuthLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <div className="flex min-h-screen items-center justify-center px-4">{children}</div>;
}


