import { redirect } from "next/navigation";

/** Configurar cai na 1ª aba. */
export default function ConfiguracoesIndex() {
  redirect("/configuracoes/pixel");
}
