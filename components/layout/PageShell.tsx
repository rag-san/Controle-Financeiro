"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

type PageShellProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function PageShell({ title, subtitle, actions, children }: PageShellProps): React.JSX.Element {
  const [openSidebar, setOpenSidebar] = useState(false);

  return (
    <div className="min-h-screen">
      <Sidebar open={openSidebar} onClose={() => setOpenSidebar(false)} />

      <div className="md:pl-72">
        <Topbar
          title={title}
          subtitle={subtitle}
          actions={actions}
          onOpenSidebar={() => setOpenSidebar(true)}
        />

        <main>
          <PageContainer>{children}</PageContainer>
        </main>
      </div>
    </div>
  );
}


