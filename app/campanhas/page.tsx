import { redirect } from "next/navigation";

// Campanhas agora vive dentro do funil Perpétuo. Mantém o link antigo.
export default function CampanhasRedirect() {
  redirect("/funil/perpetuo/campanhas");
}
