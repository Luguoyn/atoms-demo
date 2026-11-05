import { AppShell } from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ui";
import { BuilderProvider } from "@/lib/store";

export default function HomePage() {
  return (
    <BuilderProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </BuilderProvider>
  );
}
