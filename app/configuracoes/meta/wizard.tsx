"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { testMetaTokenAction, connectMetaAction, type AdAccountOption } from "./actions";

type Step = 1 | 2 | 3;

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
          done
            ? "bg-emerald-500 text-white"
            : active
              ? "bg-foreground text-background"
              : "bg-black/[.08] text-zinc-400 dark:bg-white/[.1]"
        }`}
      >
        {done ? "✓" : n}
      </span>
    </div>
  );
}

export function MetaWizard({ alreadyConnected }: { alreadyConnected: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>(1);
  const [token, setToken] = useState("");
  const [accounts, setAccounts] = useState<AdAccountOption[]>([]);
  const [selected, setSelected] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<null | { synced: boolean }>(null);

  function test() {
    setMsg(null);
    start(async () => {
      const r = await testMetaTokenAction(token);
      if (!r.ok || !r.accounts) {
        setMsg(r.error ?? "Falha ao testar a conexão.");
        return;
      }
      setAccounts(r.accounts);
      setSelected(r.accounts[0]?.id ?? "");
      setStep(3);
    });
  }

  function connect() {
    setMsg(null);
    start(async () => {
      const r = await connectMetaAction(token, selected);
      if (!r.ok) {
        setMsg(r.error ?? "Falha ao conectar.");
        return;
      }
      setDone({ synced: !!r.synced });
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-400/10 p-5">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">BM conectada ✓</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          {done.synced
            ? "Já puxei os primeiros dados do Meta. Os números aparecem no dashboard em instantes."
            : "Credenciais salvas. O primeiro sync não retornou dados agora — o cron atualiza em breve, ou use o botão “atualizar” no dashboard."}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              setDone(null);
              setStep(1);
              setToken("");
              setAccounts([]);
              setSelected("");
            }}
            className="rounded-lg border border-black/[.12] px-3 py-2 text-sm font-medium dark:border-white/[.18]"
          >
            Conectar outra BM
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-black/[.1] p-5 dark:border-white/[.14]">
      {alreadyConnected && (
        <p className="mb-4 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Este projeto já tem uma BM conectada. Concluir o passo a passo <strong>substitui</strong> a conexão atual.
        </p>
      )}

      {/* progress */}
      <div className="mb-5 flex items-center gap-3">
        <StepDot n={1} active={step === 1} done={step > 1} />
        <div className="h-px flex-1 bg-black/[.1] dark:bg-white/[.14]" />
        <StepDot n={2} active={step === 2} done={step > 2} />
        <div className="h-px flex-1 bg-black/[.1] dark:bg-white/[.14]" />
        <StepDot n={3} active={step === 3} done={false} />
      </div>

      {/* STEP 1 — instruções */}
      {step === 1 && (
        <div>
          <h3 className="text-base font-medium">1. Gere o token na sua Business Manager</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Faça uma vez por BM. O token é de um <strong>System User</strong> (usuário de sistema), não da sua conta pessoal —
            assim ele não expira quando você troca a senha.
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
            <li>
              Abra <strong>business.facebook.com</strong> → <strong>Configurações do negócio</strong> →{" "}
              <strong>Usuários → Usuários do sistema</strong>.
            </li>
            <li>
              Clique em <strong>Adicionar</strong>, dê um nome (ex.: <em>Rastreamento UTM</em>) e função{" "}
              <strong>Admin</strong>.
            </li>
            <li>
              No usuário criado, clique em <strong>Adicionar ativos</strong> → <strong>Contas de anúncio</strong> → marque a
              conta desta BM → permissão <strong>Ver desempenho</strong> (ou controle total).
            </li>
            <li>
              Clique em <strong>Gerar novo token</strong>. Selecione o app (qualquer app da BM serve) e as permissões{" "}
              <code>ads_read</code> e <code>read_insights</code>. Expiração: <strong>Nunca</strong>.
            </li>
            <li>Copie o token gerado (começa com algo tipo <code>EAAB…</code>) — ele só aparece uma vez.</li>
          </ol>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setStep(2)}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              Já tenho o token →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — colar token + testar */}
      {step === 2 && (
        <div>
          <h3 className="text-base font-medium">2. Cole o token e teste a conexão</h3>
          <p className="mt-1 text-sm text-zinc-500">
            O token vai <strong>cifrado</strong> para o cofre deste projeto. Vamos usá-lo para listar as contas de anúncio
            que ele enxerga.
          </p>
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            rows={3}
            placeholder="cole aqui o token do System User (EAAB…)"
            className="mt-3 w-full resize-none rounded-lg border border-black/[.12] bg-transparent px-3 py-2 font-mono text-xs dark:border-white/[.18]"
          />
          {msg && <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">{msg}</p>}
          <div className="mt-4 flex items-center justify-between">
            <button onClick={() => setStep(1)} className="text-sm text-zinc-500 hover:underline">
              ← voltar
            </button>
            <button
              onClick={test}
              disabled={pending || !token.trim()}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "Testando…" : "Testar conexão"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — escolher conta + conectar */}
      {step === 3 && (
        <div>
          <h3 className="text-base font-medium">3. Escolha a conta de anúncio</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Token válido ✓ — encontrei {accounts.length} {accounts.length === 1 ? "conta" : "contas"}. Selecione a conta desta
            BM que alimenta este projeto.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {accounts.map((a) => (
              <label
                key={a.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                  selected === a.id
                    ? "border-foreground bg-black/[.03] dark:bg-white/[.05]"
                    : "border-black/[.1] dark:border-white/[.14]"
                }`}
              >
                <input
                  type="radio"
                  name="adaccount"
                  checked={selected === a.id}
                  onChange={() => setSelected(a.id)}
                  className="accent-current"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.name || "(sem nome)"}</span>
                  <span className="block font-mono text-xs text-zinc-400">act_{a.id}</span>
                </span>
              </label>
            ))}
          </div>
          {msg && <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">{msg}</p>}
          <div className="mt-4 flex items-center justify-between">
            <button onClick={() => setStep(2)} className="text-sm text-zinc-500 hover:underline">
              ← trocar token
            </button>
            <button
              onClick={connect}
              disabled={pending || !selected}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "Conectando…" : "Conectar BM"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
