import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./logout-button";

/**
 * Home protegida (placeholder do dashboard real, que vem na Fase 5).
 * Serve, por ora, para comprovar que o login funciona (DoD da Fase 0).
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defesa extra além do middleware.
  if (!user) redirect("/login");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-black/[.08] bg-white p-8 text-center shadow-sm dark:border-white/[.145] dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight">
          Rastreamento UTM
        </h1>
        <p className="text-sm text-zinc-500">Franco Advertising</p>
        <p className="text-sm">
          Logado como <span className="font-medium">{user.email}</span>
        </p>
        <p className="text-xs text-zinc-400">
          Fase 0 (Fundação) concluída. O dashboard real chega na Fase 5.
        </p>
        <LogoutButton />
      </div>
    </main>
  );
}
