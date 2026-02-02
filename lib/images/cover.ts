export function pickCoverUrl(opts: {
    gameCover?: string | null;
    releaseCover?: string | null;
  }) {
    const src = (opts.gameCover || opts.releaseCover || "/img/cover-placeholder.png").trim();
    return src || "/img/cover-placeholder.png";
  }
  