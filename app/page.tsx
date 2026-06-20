import { redirect } from "next/navigation";

// A V2 é o padrão: a raiz manda direto pra Tela Central.
// O dashboard antigo (v1) fica em /v1 (link discreto em Configurações).
export default function Home() {
  redirect("/central");
}
