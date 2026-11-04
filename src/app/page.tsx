import { AppShell } from "@/components/layout/AppShell";
import { BuilderProvider } from "@/lib/store";

export default function HomePage() {
  return (
    <BuilderProvider>
      <AppShell />
    </BuilderProvider>
  );
}
