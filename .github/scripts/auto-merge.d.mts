// Tipos do auto-merge.mjs para os testes (o script roda em node puro no workflow).
export const REQUIRED_CHECKS: string[]
export const SKIPPABLE_CHECKS: string[]
export const MERGE_BASE: string
export const REVIEW_BOT: string
export const MIN_SCORE: number
export const DEPENDENTS_PAGE: number
export const AUTO_MERGE_WORKFLOW: string
export const APPROVE_BODY: string

export interface PrState {
  state: string
  isDraft: boolean
  baseRefName: string
  headRefName?: string
  isCrossRepository: boolean
  failing: string[]
  score: number | null
  openThreads: number
  moreThreads: boolean
}

export interface QueueIo {
  gather: (n: string) => { sha: string; approved: boolean; pr: PrState }
  listDependents: (head: string) => string[]
  approve: (n: string, sha: string) => void
  merge: (n: string, sha: string) => void
  retarget: (n: string) => void
  deleteBranch: (branch: string) => void
  dispatch: (n: string) => void
  log: (msg: string) => void
}

export type CheckRun = { status: string; conclusion: string | null }
export function checksPassed(runs: CheckRun[], allowSkipped?: boolean): boolean
export function failingChecks(runsOf: (name: string) => CheckRun[]): string[]
export function approvedAt(reviews: { commit_id: string; state: string }[], sha: string): boolean
export function reviewScore(reviews: { user: { login: string } | null; commit_id: string; body: string | null }[], sha: string): number | null
export function evaluate(pr: PrState): { ok: boolean; reason: string }
export function approveArgs(number: string, repo: string, sha: string): string[]
export function mergeArgs(number: string, repo: string, sha: string): string[]
export function dependentsOf(head: string, prs: { number: number | string; baseRefName: string }[]): string[]
export function retargetArgs(number: string, repo: string): string[]
export function deleteBranchArgs(repo: string, branch: string): string[]
export function isMissingRef(err: unknown): boolean
export function dispatchArgs(number: string, repo: string): string[]
export function runQueue(numbers: string[], io: QueueIo): { merged: string[]; dispatched: string[] }
