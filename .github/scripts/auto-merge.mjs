// Auto-merge do PR (SPEC-0739, TDR-0015): checks obrigatórios verdes + Claude review 5/5 + conversas resolvidas, no
// head. Porte do auto-merge do ddd00-game: com o repo privado no plano Free, o ruleset e o auto-merge nativo somem.
// Pilha de PRs (TDR-0014): só mergeia na `main`; depois do merge redireciona os dependentes e dispara o auto-merge de
// cada um na execução própria (grupo de concorrência do PR), sem corrida entre execuções.
// O merge sai com o token do App (MERGE_TOKEN): merge pelo GITHUB_TOKEN não dispara o push que roda o release.yml.
// Uso (no workflow): PRS="7 8" node .github/scripts/auto-merge.mjs
// Falha fechada: qualquer erro de consulta lança e o job cai sem mergear nada.
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** Checks que o ruleset "Protecao do main" exigia; todos precisam de `success` no head. */
export const REQUIRED_CHECKS = ['Detectar mudanças', 'Regras do repo', 'Tests (Vitest)']
/** Check obrigatório que o `pr.yml` pula quando o PR não toca o nativo: `skipped` também vale. */
export const SKIPPABLE_CHECKS = ['Host nativo (Windows) + cortex_host_tests']
/** Única base em que o auto-merge mergeia; PR empilhado espera a vez (TDR-0014). */
export const MERGE_BASE = 'main'
/** Quem publica a nota do Claude review (o `GITHUB_TOKEN` do `claude-review.yml`). */
export const REVIEW_BOT = 'github-actions[bot]'
/** Nota mínima do Claude review: só 5/5 mergeia. */
export const MIN_SCORE = 5
/** Página da lista de dependentes: cheia, pode haver mais, e o job lança (falha fechada). */
export const DEPENDENTS_PAGE = 100
/** Workflow que o script dispara para cada dependente. */
export const AUTO_MERGE_WORKFLOW = 'auto-merge.yml'
/** Texto da aprovação que o auto-merge publica quando o review ainda não aprovou o head. */
export const APPROVE_BODY = 'Aprovado pelo auto-merge: checks verdes, Claude review 5/5 e conversas resolvidas neste commit (SPEC-0739).'
/** `**Claude review: N/5**` do `claude-review.yml` deste repo. */
const SCORE_MARK = /\*\*Claude review: (\d)\/5\*\*/
/** Resposta do GitHub para ref que já não existe (apagada pelo `delete_branch_on_merge`). */
const MISSING_REF = /HTTP (404|422)/
/** Estados de revisão que não mudam a posição de quem revisou (só comentário ou rascunho). */
const NEUTRAL_REVIEW_STATES = ['COMMENTED', 'PENDING']
const CHANGES_REQUESTED = 'CHANGES_REQUESTED'
const SUCCESS = 'success'
const SKIPPED = 'skipped'

/** true se o check tem execução e TODAS as mais recentes terminaram em success (ou skipped, se permitido). */
export function checksPassed(runs, allowSkipped = false) {
  const okConclusion = (c) => c === SUCCESS || (allowSkipped && c === SKIPPED)
  return runs.length > 0 && runs.every((r) => r.status === 'completed' && okConclusion(r.conclusion))
}

/**
 * Nomes dos checks que barram o merge (vazio = todos ok).
 * @param {(name: string) => { status: string, conclusion: string | null }[]} runsOf
 */
export function failingChecks(runsOf) {
  return [
    ...REQUIRED_CHECKS.filter((name) => !checksPassed(runsOf(name))),
    ...SKIPPABLE_CHECKS.filter((name) => !checksPassed(runsOf(name), true)),
  ]
}

/**
 * Nota da revisão mais recente do bot no commit `sha` (as revisões vêm em ordem cronológica), ou null se não há.
 * @param {{ user: { login: string } | null, commit_id: string, body: string | null }[]} reviews
 */
export function reviewScore(reviews, sha) {
  let score = null
  for (const r of reviews) {
    if (r.user?.login !== REVIEW_BOT || r.commit_id !== sha) continue
    const m = SCORE_MARK.exec(r.body ?? '')
    if (m) score = Number(m[1])
  }
  return score
}

/** true se o bot já aprovou o commit `sha` (o review aprova sozinho quando dá 5/5); aprovação humana não conta. */
export function approvedAt(reviews, sha) {
  return reviews.some((r) => r.user?.login === REVIEW_BOT && r.commit_id === sha && r.state === 'APPROVED')
}

/**
 * true se alguém tem pedido de mudança em aberto: a revisão mais recente dessa pessoa que não é só comentário é
 * CHANGES_REQUESTED (uma aprovação ou um dismiss depois dela libera). Vale em qualquer commit, como no ruleset.
 * @param {{ user: { login: string } | null, state: string }[]} reviews em ordem cronológica
 */
export function changesRequested(reviews) {
  const last = new Map()
  for (const r of reviews) {
    if (!r.user || NEUTRAL_REVIEW_STATES.includes(r.state)) continue
    last.set(r.user.login, r.state)
  }
  return [...last.values()].includes(CHANGES_REQUESTED)
}

/**
 * @param {{ state: string, isDraft: boolean, baseRefName: string, isCrossRepository: boolean,
 *           failing: string[], score: number | null, changesRequested: boolean, behindBy: number,
 *           openThreads: number, moreThreads: boolean }} pr
 * @returns {{ ok: boolean, reason: string }}
 */
export function evaluate(pr) {
  if (pr.state !== 'OPEN' || pr.isDraft || pr.isCrossRepository) {
    return { ok: false, reason: 'não está aberto/pronto' }
  }
  if (pr.baseRefName !== MERGE_BASE) {
    return { ok: false, reason: `base é ${pr.baseRefName}, não a ${MERGE_BASE}: espera a base entrar (pilha)` }
  }
  if (pr.behindBy > 0) {
    return { ok: false, reason: `${pr.behindBy} commit(s) atrás da ${MERGE_BASE}: atualize a branch e espere a nova nota` }
  }
  if (pr.failing.length > 0) return { ok: false, reason: `checks pendentes ou vermelhos no head: ${pr.failing.join(', ')}` }
  if (pr.score === null) return { ok: false, reason: 'Claude review pendente no head' }
  if (pr.score < MIN_SCORE) return { ok: false, reason: `Claude review ${pr.score}/5 no head (precisa de ${MIN_SCORE})` }
  if (pr.changesRequested) return { ok: false, reason: 'há pedido de mudança (CHANGES_REQUESTED) em aberto' }
  if (pr.moreThreads) return { ok: false, reason: 'mais conversas do que uma página; não dá para confirmar todas' }
  if (pr.openThreads > 0) return { ok: false, reason: `${pr.openThreads} conversa(s) de revisão aberta(s)` }
  return { ok: true, reason: `checks verdes, Claude review ${pr.score}/5, conversas resolvidas` }
}

/** Argumentos do `gh` para o merge: só no head avaliado. A branch só some depois de redirecionar os dependentes. */
export function mergeArgs(number, repo, sha) {
  return ['pr', 'merge', String(number), '-R', repo, '--merge', '--match-head-commit', sha]
}

/** Argumentos do `gh` para aprovar o PR no head avaliado: APPROVE preso ao `commit_id`. */
export function approveArgs(number, repo, sha) {
  return [
    'api', '-X', 'POST', `repos/${repo}/pulls/${number}/reviews`,
    '-f', `commit_id=${sha}`, '-f', 'event=APPROVE', '-f', `body=${APPROVE_BODY}`,
  ]
}

/** Números dos PRs abertos que miram a branch `head`, em ordem crescente. */
export function dependentsOf(head, prs) {
  return prs
    .filter((p) => p.baseRefName === head)
    .map((p) => String(p.number))
    .sort((a, b) => Number(a) - Number(b))
}

/** Argumentos do `gh` para mudar a base do PR para a `main` (REST: o `gh pr edit` consulta Projects e já quebrou). */
export function retargetArgs(number, repo) {
  return ['api', '-X', 'PATCH', `repos/${repo}/pulls/${number}`, '-f', `base=${MERGE_BASE}`]
}

/** Argumentos do `gh` para apagar a branch; recusa a `main` e nome vazio. */
export function deleteBranchArgs(repo, branch) {
  if (!branch || branch === MERGE_BASE) throw new Error(`recusa apagar a branch "${branch}"`)
  const ref = branch.split('/').map(encodeURIComponent).join('/')
  return ['api', '-X', 'DELETE', `repos/${repo}/git/refs/heads/${ref}`]
}

/** true se o erro do `gh` é a ref que já não existe (o GitHub apagou no merge). */
export function isMissingRef(err) {
  return MISSING_REF.test(`${err?.stderr ?? ''}${err?.message ?? ''}`)
}

/** Argumentos do `gh` para disparar o auto-merge de um PR na execução e no grupo de concorrência dele. */
export function dispatchArgs(number, repo) {
  return ['workflow', 'run', AUTO_MERGE_WORKFLOW, '-R', repo, '--ref', MERGE_BASE, '-f', `pr=${number}`]
}

/**
 * Processa os PRs pedidos. Só o PRIMEIRO (o que dá nome ao grupo de concorrência da execução) é avaliado e mergeado
 * aqui; os outros e os dependentes ganham execução própria por `workflow_dispatch`, no grupo deles.
 * Se o primeiro passa: lista os dependentes ANTES do merge (o `delete_branch_on_merge` pode redirecioná-los logo
 * depois), aprova o head se ainda não aprovado, mergeia, redireciona cada dependente, apaga a branch e dispara os
 * dependentes. Qualquer erro de `io` lança e para tudo.
 * @param {string[]} numbers
 * @param {{ gather: (n: string) => { sha: string, approved: boolean, pr: any },
 *           listDependents: (head: string) => string[], approve: (n: string, sha: string) => void,
 *           merge: (n: string, sha: string) => void, retarget: (n: string) => void,
 *           deleteBranch: (branch: string) => void, dispatch: (n: string) => void,
 *           log: (msg: string) => void }} io
 * @returns {{ merged: string[], dispatched: string[] }}
 */
export function runQueue(numbers, io) {
  const [own, ...others] = [...new Set(numbers.map(String))]
  const merged = []
  const toDispatch = own === undefined ? [] : processOwn(own, io, merged)
  const dispatched = [...new Set([...toDispatch, ...others])]
  for (const n of dispatched) {
    io.dispatch(n)
    io.log(`PR #${n}: auto-merge disparado na execução dele`)
  }
  return { merged, dispatched }
}

/** Avalia e mergeia o PR do grupo; devolve os dependentes já redirecionados para a `main`. */
function processOwn(number, io, merged) {
  const { sha, approved, pr } = io.gather(number)
  const { ok, reason } = evaluate(pr)
  io.log(`PR #${number}: ${reason}`)
  if (!ok) return []
  const dependents = io.listDependents(pr.headRefName)
  if (!approved) io.approve(number, sha)
  io.merge(number, sha)
  merged.push(number)
  for (const d of dependents) {
    io.retarget(d)
    io.log(`PR #${d}: base redirecionada de ${pr.headRefName} para ${MERGE_BASE}`)
  }
  io.deleteBranch(pr.headRefName)
  return dependents
}

/** `gh` com o token padrão do job; `token` troca o GH_TOKEN só nesta chamada. */
function gh(args, token) {
  const env = token ? { ...process.env, GH_TOKEN: token } : process.env
  return execFileSync('gh', args, { encoding: 'utf8', env })
}

const THREADS_PAGE = 100
const QUERY = `query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){
  reviewThreads(first:${THREADS_PAGE}){pageInfo{hasNextPage} nodes{isResolved}}}}}`

/** Estado do PR consultado no GitHub (exportado para teste a seco contra um PR real). */
export function gather(repo, number) {
  const info = JSON.parse(
    gh(['pr', 'view', String(number), '-R', repo, '--json', 'state,isDraft,baseRefName,headRefName,isCrossRepository,headRefOid']),
  )
  const sha = info.headRefOid
  const runsOf = (name) =>
    JSON.parse(gh(['api', `repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(name)}`])).check_runs
  const [owner, name] = repo.split('/')
  const pull = JSON.parse(gh(['api', 'graphql', '-F', `n=${number}`, '-f', `o=${owner}`, '-f', `r=${name}`, '-f', `query=${QUERY}`]))
    .data.repository.pullRequest
  const threads = pull.reviewThreads
  const reviews = JSON.parse(gh(['api', `repos/${repo}/pulls/${number}/reviews`, '--paginate', '--slurp'])).flat()
  return {
    sha,
    approved: approvedAt(reviews, sha),
    pr: {
      ...info,
      failing: failingChecks(runsOf),
      score: reviewScore(reviews, sha),
      changesRequested: changesRequested(reviews),
      behindBy: JSON.parse(gh(['api', `repos/${repo}/compare/${MERGE_BASE}...${sha}`, '--jq', '{b: .behind_by}'])).b,
      openThreads: threads.nodes.filter((t) => !t.isResolved).length,
      moreThreads: threads.pageInfo.hasNextPage,
    },
  }
}

/** PRs abertos cuja base é `head`; página cheia lança (pode haver mais do que se vê). */
function listDependents(repo, head) {
  const prs = JSON.parse(
    gh(['pr', 'list', '-R', repo, '--base', head, '--state', 'open', '--json', 'number,baseRefName', '--limit', String(DEPENDENTS_PAGE)]),
  )
  if (prs.length >= DEPENDENTS_PAGE) throw new Error(`${prs.length} PRs miram ${head}: não dá para confirmar todos`)
  return dependentsOf(head, prs)
}

function deleteBranch(repo, branch) {
  try {
    gh(deleteBranchArgs(repo, branch))
  } catch (err) {
    if (!isMissingRef(err)) throw err
  }
}

function main() {
  const repo = process.env.REPO
  const mergeToken = process.env.MERGE_TOKEN
  if (!mergeToken) throw new Error('MERGE_TOKEN ausente: sem o token do App o merge não dispara o release.yml')
  const numbers = (process.env.PRS ?? '').split(/\s+/).filter(Boolean)
  runQueue(numbers, {
    gather: (n) => gather(repo, n),
    listDependents: (head) => listDependents(repo, head),
    approve: (n, sha) => gh(approveArgs(n, repo, sha)),
    merge: (n, sha) => gh(mergeArgs(n, repo, sha), mergeToken),
    retarget: (n) => gh(retargetArgs(n, repo)),
    deleteBranch: (branch) => deleteBranch(repo, branch),
    dispatch: (n) => gh(dispatchArgs(n, repo)),
    log: (msg) => console.log(msg),
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
