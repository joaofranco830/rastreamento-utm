/** Placeholder padrão "Em produção" para itens ainda não construídos (ADR-v3-14). */
export default function EmProducao({ titulo }: { titulo: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-black/[.08] text-2xl dark:border-white/[.12]">
        🚧
      </div>
      <h1 className="text-lg font-semibold tracking-tight">{titulo}</h1>
      <p className="max-w-sm text-sm text-zinc-400">
        Esta área está <strong>em produção</strong> — faz parte do mapa da plataforma e será
        construída numa próxima leva. Por enquanto, é um espaço reservado.
      </p>
    </div>
  );
}
