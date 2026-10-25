/** Resolves Vite's public base for a GitHub Pages project site or local development. */
export function resolveGitHubPagesBase(repository: string | undefined, isGitHubActions: boolean): string {
  if (!isGitHubActions || !repository) return "/";
  const [owner, name] = repository.split("/");
  if (!owner || !name) return "/";
  if (name.toLowerCase() === `${owner}.github.io`.toLowerCase()) return "/";
  return `/${name}/`;
}
