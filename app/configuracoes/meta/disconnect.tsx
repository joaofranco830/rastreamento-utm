"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectMetaAction } from "./actions";

export function DisconnectMeta() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="text-xs text-zinc-400 underline hover:text-red-500"
      >
        Desconectar esta BM
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-400">Remover a conexão do Meta deste projeto?</span>
      <button
        onClick={() =>
          start(async () => {
            await disconnectMetaAction();
            setConfirm(false);
            router.refresh();
          })
        }
        disabled={pending}
        className="rounded-md bg-red-500 px-2 py-1 font-medium text-white disabled:opacity-50"
      >
        {pending ? "…" : "Sim, desconectar"}
      </button>
      <button onClick={() => setConfirm(false)} className="text-zinc-400 hover:underline">
        cancelar
      </button>
    </div>
  );
}
