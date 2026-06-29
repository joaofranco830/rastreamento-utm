"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/tenant";

/**
 * Troca o projeto ativo. Valida a filiação (RLS: só retorna o projeto se o
 * usuário puder vê-lo) antes de gravar o cookie. (USR-05)
 */
export async function setActiveProjectAction(projectId: number): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (data) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_PROJECT_COOKIE, String(projectId), {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  revalidatePath("/", "layout");
}
