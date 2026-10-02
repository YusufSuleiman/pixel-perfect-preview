<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- AI conversation history is stored per authenticated account and each thread is addressed by its route ID, because messages must remain isolated and reloadable.
- Portfolio AI requests recompute accounting server-side from the raw owner-scoped ledger, because model explanations must use the same auditable source data as the interface.
