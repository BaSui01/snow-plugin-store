// Business UI belongs to this plugin; the host supplies only a lifecycle-bound slot.
export function mountFooter(container, api, context, signal) {
  const t = (key, values) => api.t(key, { defaultValue: key, values });
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const root = element("section", "sfc-inline");
  root.hidden = true;
  root.setAttribute("aria-label", t("footer.title"));
  container.append(root);
  let disposed = false;
  let subscription;
  let runtime = null;
  let expanded = false;
  let latestGeneratedAt = 0;
  const active = () => !disposed && !signal.aborted;
  const recordsFor = (map) =>
    map &&
    typeof map === "object" &&
    Object.prototype.hasOwnProperty.call(map, context.conversationId) &&
    Array.isArray(map[context.conversationId])
      ? map[context.conversationId]
      : null;
  const relativePath = (record) => {
    if (typeof record.root !== "string" || !record.root) return record.filePath;
    const path = record.filePath.replaceAll("\\", "/");
    const prefix = `${record.root.replaceAll("\\", "/").replace(/\/+$/, "")}/`;
    const windows = /^[A-Za-z]:\//.test(path) || path.startsWith("//");
    const contained = windows
      ? path.toLowerCase().startsWith(prefix.toLowerCase())
      : path.startsWith(prefix);
    const relative = path.slice(prefix.length);
    return contained &&
      relative &&
      !relative.split("/").some((part) => part === "." || part === "..")
      ? relative
      : record.filePath;
  };
  const linesFor = (record) => {
    if (
      record.source === "terminal" ||
      record.diff?.isBinary ||
      typeof record.diff?.patch !== "string" ||
      !record.diff.patch
    )
      return null;
    let additions = 0;
    let deletions = 0;
    for (const line of record.diff.patch.split("\n").slice(2)) {
      if (line.startsWith("+")) additions += 1;
      else if (line.startsWith("-")) deletions += 1;
    }
    return { additions, deletions };
  };
  const signedLines = (stats) => {
    const row = element("span", "sfc-inline-lines");
    row.append(
      element(
        "span",
        "sfc-inline-add",
        `+${stats.additions.toLocaleString(api.locale)}`,
      ),
      element(
        "span",
        "sfc-inline-delete",
        `−${stats.deletions.toLocaleString(api.locale)}`,
      ),
    );
    return row;
  };
  const render = () => {
    if (!active()) return;
    root.replaceChildren();
    const conversation = runtime?.conversation;
    if (
      conversation?.conversationId !== context.conversationId ||
      conversation.isStreaming ||
      conversation.isPaused ||
      conversation.isAborting
    ) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    if (
      api.ui?.messageFooterVersion !== 1 ||
      conversation.fileChangeTrackingVersion !== 1
    ) {
      root.append(element("p", "sfc-inline-note", t("footerUpgrade")));
      return;
    }
    const raw = recordsFor(conversation.fileChangeStats);
    const coverage = recordsFor(conversation.fileChangeCoverage);
    if (!raw) {
      root.append(element("p", "sfc-inline-note", t("unavailable")));
      return;
    }
    const latest = new Map();
    for (const record of raw) {
      if (
        !record ||
        typeof record.filePath !== "string" ||
        !record.filePath.trim()
      )
        continue;
      const key =
        typeof record.fileKey === "string" && record.fileKey
          ? record.fileKey
          : record.filePath;
      const previous = latest.get(key);
      if (
        !previous ||
        (Number(record.timestamp) || 0) >= (Number(previous.timestamp) || 0)
      )
        latest.set(key, record);
    }
    const files = [...latest.values()].sort(
      (left, right) =>
        (Number(left.timestamp) || 0) - (Number(right.timestamp) || 0),
    );
    if (!files.length && coverage?.length === 0) {
      root.hidden = true;
      return;
    }
    const heading = element("div", "sfc-inline-heading");
    const icon = element("span", "sfc-inline-icon", "▤");
    icon.setAttribute("aria-hidden", "true");
    const text = element("div", "sfc-inline-heading-text");
    text.append(
      element(
        "strong",
        "",
        files.length
          ? t("footer.recorded", { count: files.length })
          : t("footer.empty"),
      ),
      element("span", "sfc-inline-muted", t("footer.cumulative")),
    );
    const known = files.map(linesFor).filter(Boolean);
    if (known.length) {
      const totals = known.reduce(
        (total, item) => ({
          additions: total.additions + item.additions,
          deletions: total.deletions + item.deletions,
        }),
        { additions: 0, deletions: 0 },
      );
      const stats = element("div", "sfc-inline-heading-lines");
      stats.append(
        signedLines(totals),
        element("span", "sfc-inline-muted", t("footer.knownLines")),
      );
      text.append(stats);
    } else if (files.length) {
      text.append(
        element("span", "sfc-inline-muted", t("footer.linesUnavailable")),
      );
    }
    heading.append(icon, text);
    root.append(heading);
    const list = element("ul", "sfc-inline-list");
    list.id = `sfc-files-${crypto.randomUUID()}`;
    for (const file of expanded ? files : files.slice(0, 4)) {
      const row = element("li", "sfc-inline-file");
      const path = element("span", "sfc-inline-path", relativePath(file));
      path.title = file.filePath;
      row.append(path);
      const stats = linesFor(file);
      row.append(
        stats
          ? signedLines(stats)
          : element("span", "sfc-inline-muted", t("footer.linesUnavailable")),
      );
      list.append(row);
    }
    root.append(list);
    if (files.length > 4) {
      const toggle = element("button", "sfc-inline-toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-controls", list.id);
      const chevron = element("span", "sfc-inline-chevron");
      chevron.setAttribute("aria-hidden", "true");
      toggle.append(
        element(
          "span",
          "",
          t(expanded ? "footer.collapse" : "footer.allFiles", {
            count: files.length,
          }),
        ),
        chevron,
      );
      toggle.addEventListener("click", () => {
        if (!active()) return;
        expanded = !expanded;
        render();
        root
          .querySelector(".sfc-inline-toggle")
          ?.focus({ preventScroll: true });
      });
      root.append(toggle);
    }
    if (coverage === null)
      root.append(element("p", "sfc-inline-note", t("coverageMissing")));
    if (files.some((file) => !file.fileKey || !file.source))
      root.append(element("p", "sfc-inline-note", t("footer.legacy")));
  };
  const accept = (response) => {
    if (!active()) return;
    const generatedAt = Number(response?.generatedAt) || 0;
    if (generatedAt < latestGeneratedAt) return;
    latestGeneratedAt = generatedAt;
    runtime = response?.domains?.runtime ?? null;
    render();
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", cleanup);
    try {
      subscription?.unsubscribe();
    } finally {
      root.remove();
      runtime = null;
    }
  };
  signal.addEventListener("abort", cleanup, { once: true });
  if (!active()) {
    cleanup();
    return cleanup;
  }
  void (async () => {
    const sub = await api.metadata.subscribe("runtime", accept);
    if (!active()) sub.unsubscribe();
    else subscription = sub;
  })().catch(() => {
    if (!active()) return;
    root.replaceChildren(element("p", "sfc-inline-note", t("readError")));
    root.hidden = false;
  });
  return cleanup;
}
