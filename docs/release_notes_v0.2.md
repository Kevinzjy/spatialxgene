# Release notes — v0.2.0

Short summary of v0.2 scope and development experience for future reference.

## Scope

- **UX**: Embedding toggle (Spatial/UMAP), hover tooltip (spot ID + annotation/gene), annotation legend (count-sorted, with spot counts), zoom/reset buttons, cursor-centered zoom, loading overlay on dataset switch, gray points when no annotation/gene selected, full viewport layout (no scrollbar), favicon and sidebar logo.
- **Robustness**: Histogram-based percentile to avoid stack overflow on large or constant expression arrays; UMAP spot size slider fixed for dense embeddings; drag and hover updates throttled with `requestAnimationFrame` for Safari/Firefox.
- **Performance**: LOD (max drawn points), fillRect vs arc by zoom, DPR cap at 2, Firefox-specific lower LOD cap; rAF-driven pan so only one React update per frame.

## Development experience (lessons)

- **Cross-browser**: Chrome’s Canvas 2D and JS are fastest; Safari/Firefox benefit from capping update frequency (rAF), canvas resolution (DPR), and draw count (LOD). Keep drag/hover logic dependency-correct (e.g. include `drag` in `onMouseMove` deps) so refs and state stay in sync.
- **Large arrays**: Avoid sort/recursion on 300k+ elements in the main thread; use O(n) histogram or subsampling for percentiles and hit-test throttling for hover.
- **Responsive layout**: Reset `html`/`body` (margin 0, height 100%, overflow hidden) and make `#root` and app root use flex + `flex: 1` so the app fills the viewport without an extra scrollbar.
- **Versioning**: Bump `__version__`, `pyproject.toml` version, and `frontend/package.json` version together; document all user-visible and technical changes in CHANGELOG and READMEs.

## Release checklist (v0.2)

- [x] Version set to 0.2.0 in `spatialxgene/__init__.py`, `pyproject.toml`, `spatialxgene/frontend/package.json`. (Later: 0.2.1 for packaging/doc updates.)
- [x] CHANGELOG.md updated with [0.2.0] section.
- [x] Root README and `spatialxgene/README.md` updated (viewer description, doc link).
- [x] docs/design_guidelines.md updated (tooltip, legend, zoom/reset, loading, viewport).
- [x] docs/tasks.md updated (v0.2 completed items).
- [ ] Optional: `npm run build` in frontend, then `spatialxgene launch` smoke test.
- [ ] Optional: tag in git, e.g. `git tag v0.2.0`.
