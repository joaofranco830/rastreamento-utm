import { redirect } from "next/navigation";

// A Central virou o "Dashboard" dentro do funil Perpétuo (V3.x). Mantém o link antigo.
export default function CentralRedirect() {
  redirect("/funil/perpetuo");
}
