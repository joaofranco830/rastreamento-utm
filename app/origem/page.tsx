import { redirect } from "next/navigation";

// Origem agora vive dentro do funil Perpétuo. Mantém o link antigo.
export default function OrigemRedirect() {
  redirect("/funil/perpetuo/origem");
}
