"use client";

import { useState } from "react";
import { PageContainer } from "./PageContainer";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

type PageShellProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function PageShell({ title, subtitle, actions, children }: PageShellProps): React.JSX.Element {
  const [openSidebar, setOpenSidebar] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <Sidebar open={openSidebar} onClose={() => setOpenSidebar(false)} />

      <div className="md:pl-72">
        <Topbar
          title={title}
          subtitle={subtitle}
          actions={actions}
          onOpenSidebar={() => setOpenSidebar(true)}
        />

        <main className="overflow-x-hidden">
          <PageContainer>{children}</PageContainer>
        </main>
      </div>
    </div>
  );
}


