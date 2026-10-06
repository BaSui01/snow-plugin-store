// Read-only runtime panel. No Git scans, command execution, or persistent copies.
export function mount(container, api) {
  const t = (key, values) => api.t(key, { defaultValue: key, values });
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const root = element("section", "sfc");
  const heading = element("header", "sfc-heading");
  heading.append(element("h2", "", t("title")));
  const refresh = element("button", "sfc-button", t("refresh"));
  refresh.type = "button";
  heading.append(refresh);
  const toolbar = element("div", "sfc-toolbar");
  const search = element("input", "sfc-search");
  search.type = "search";
  search.placeholder = t("search");
  search.setAttribute("aria-label", t("search"));
  const sourceFilter = element("select", "sfc-select");
  sourceFilter.setAttribute("aria-label", t("filter"));
  for (const value of ["all", "filesystem", "terminal", "legacy"]) {
    const option = element("option", "", t(value));
    option.value = value;
    sourceFilter.append(option);
  }
  toolbar.append(search, sourceFilter);
  const content = element("div", "sfc-content");
  const status = element("p", "sfc-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  root.append(heading, toolbar, status, content);
  container.append(root);
  let snapshot = null;
  let disposed = false;
  let requestSequence = 0;
  let subscription;

  const recordsFor = (map, id) =>
    map &&
    typeof map === "object" &&
    Object.prototype.hasOwnProperty.call(map, id) &&
    Array.isArray(map[id])
      ? map[id]
      : null;
  const render = () => {
    const coverageOpen = content.querySelector("details")?.open ?? false;
    content.replaceChildren();
    const conversation = snapshot?.conversation;
    const id = conversation?.conversationId;
    if (typeof id !== "string" || !id.trim()) {
      content.append(element("p", "sfc-empty", t("noSession")));
      return;
    }
    const info = element("div", "sfc-session");
    const title =
      typeof conversation.title === "string" && conversation.title
        ? conversation.title
        : t("untitled");
    info.append(element("h3", "", title));
    const phase = conversation.isAborting
      ? "aborting"
      : conversation.isPaused
        ? "paused"
        : conversation.isStreaming
          ? "running"
          : Array.isArray(conversation.completedConversationIds) &&
              conversation.completedConversationIds.includes(id)
            ? "finished"
            : "idle";
    const badge = element("span", "sfc-badge", t(phase));
    badge.dataset.phase = phase;
    info.append(badge);
    content.append(info);
    const enhanced = conversation.fileChangeTrackingVersion === 1;
    const records = recordsFor(conversation.fileChangeStats, id);
    if (!records) {
      content.append(element("p", "sfc-warning", t("unavailable")));
      return;
    }
    const groups = new Map();
    for (const record of records) {
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
      const source =
        record.source === "filesystem" && typeof record.fileKey === "string"
          ? "filesystem"
          : record.source === "terminal" && typeof record.fileKey === "string"
            ? "terminal"
            : "legacy";
      let group = groups.get(key);
      if (!group) {
        group = { key, latest: record, sources: new Set(), agents: new Set() };
        groups.set(key, group);
      }
      group.sources.add(source);
      group.agents.add(record.agent === "sub" ? "sub" : "main");
      if (
        (Number(record.timestamp) || 0) >= (Number(group.latest.timestamp) || 0)
      )
        group.latest = record;
    }
    const summary = element("div", "sfc-summary");
    const countCard = (label, count) => {
      const card = element("div", "sfc-card");
      card.append(
        element("strong", "sfc-number", count),
        element("span", "", t(label)),
      );
      summary.append(card);
    };
    countCard("total", groups.size);
    for (const source of ["filesystem", "terminal", "legacy"]) {
      const count = [...groups.values()].filter((group) =>
        group.sources.has(source),
      ).length;
      if (source !== "legacy" || count > 0) countCard(source, count);
    }
    content.append(summary);
    if (!enhanced) content.append(element("p", "sfc-warning", t("upgrade")));
    if (api.ui?.messageFooterVersion !== 1)
      content.append(element("p", "sfc-warning", t("footerUpgrade")));
    const coverage = enhanced
      ? recordsFor(conversation.fileChangeCoverage, id)
      : null;
    if (enhanced && coverage === null)
      content.append(element("p", "sfc-warning", t("coverageMissing")));
    if (coverage?.length) {
      const details = element("details", "sfc-coverage");
      details.open = coverageOpen;
      details.append(element("summary", "", t("coverage")));
      const issues = new Map();
      for (const item of coverage) {
        if (
          !item ||
          !["filesystem", "terminal"].includes(item.source) ||
          !["scoped", "partial", "unavailable"].includes(item.coverage)
        )
          continue;
        const reasons = Array.isArray(item.reasons)
          ? item.reasons.filter((reason) => typeof reason === "string")
          : [];
        const signature = JSON.stringify([
          item.source,
          item.coverage,
          item.root,
          reasons,
          item.agent,
          item.subAgentName,
        ]);
        const existing = issues.get(signature);
        if (existing) existing.count += 1;
        else issues.set(signature, { ...item, reasons, count: 1 });
      }
      for (const issue of issues.values()) {
        const row = element("div", "sfc-coverage-row");
        row.append(
          element(
            "strong",
            "",
            `${t(issue.source)} · ${t(issue.coverage)} × ${issue.count}`,
          ),
        );
        if (issue.agent === "sub")
          row.append(
            element(
              "span",
              "sfc-meta",
              `${t("sub")}${issue.subAgentName ? ` · ${issue.subAgentName}` : ""}`,
            ),
          );
        if (typeof issue.root === "string")
          row.append(element("code", "sfc-path", issue.root));
        row.append(
          element(
            "span",
            "sfc-meta",
            issue.reasons
              .map((reason) =>
                api.t(`reason.${reason}`, { defaultValue: reason }),
              )
              .join(" · "),
          ),
        );
        details.append(row);
      }
      content.append(details);
    }
    const query = search.value.trim().toLocaleLowerCase();
    const selected = sourceFilter.value;
    const visible = [...groups.values()].filter(
      (group) =>
        (selected === "all" || group.sources.has(selected)) &&
        group.latest.filePath.toLocaleLowerCase().includes(query),
    );
    visible.sort(
      (a, b) =>
        (Number(b.latest.timestamp) || 0) - (Number(a.latest.timestamp) || 0) ||
        a.latest.filePath.localeCompare(b.latest.filePath),
    );
    content.append(
      element("h3", "sfc-list-title", t("files", { count: visible.length })),
    );
    if (!visible.length)
      content.append(
        element("p", "sfc-empty", t(groups.size ? "noMatch" : "noRecords")),
      );
    const list = element("ul", "sfc-list");
    // Keep large histories responsive; the complete count above is not truncated.
    for (const group of visible.slice(0, 500)) {
      const row = element("li", "sfc-file");
      const filePath = group.latest.filePath;
      const filename = filePath.split(/[\\/]/).filter(Boolean).pop() || filePath;
      row.append(
        element("strong", "sfc-filename", filename),
        element("code", "sfc-path", filePath),
      );
      const metadata = element("div", "sfc-meta");
      for (const source of group.sources)
        metadata.append(element("span", "sfc-tag", t(source)));
      for (const agent of group.agents)
        metadata.append(element("span", "sfc-tag", t(agent)));
      if (["create", "edit", "delete"].includes(group.latest.kind)) {
        const kind = element("span", "sfc-tag", t(group.latest.kind));
        kind.dataset.kind = group.latest.kind;
        metadata.append(kind);
      }
      if (Number.isFinite(group.latest.timestamp) && group.latest.timestamp > 0) {
        const time = element(
          "time",
          "sfc-time",
          new Date(group.latest.timestamp).toLocaleString(api.locale),
        );
        metadata.append(time);
      }
      row.append(metadata);
      list.append(row);
    }
    content.append(list);
    if (visible.length > 500)
      content.append(element("p", "sfc-note", t("displayLimit")));
  };
  const accept = (response) => {
    if (disposed) return;
    requestSequence += 1;
    if (!response?.domains?.runtime) {
      snapshot = null;
      status.textContent = t("readError");
      content.replaceChildren(element("p", "sfc-warning", t("unavailable")));
      return;
    }
    snapshot = response.domains.runtime;
    status.textContent = "";
    render();
  };
  const reload = async () => {
    const sequence = ++requestSequence;
    try {
      const response = await api.metadata.get("runtime");
      if (!disposed && sequence === requestSequence) accept(response);
    } catch {
      if (!disposed && sequence === requestSequence) {
        snapshot = null;
        status.textContent = t("readError");
        content.replaceChildren(element("p", "sfc-warning", t("unavailable")));
      }
    }
  };
  refresh.addEventListener("click", reload);
  search.addEventListener("input", render);
  sourceFilter.addEventListener("change", render);
  render();
  void (async () => {
    const sub = await api.metadata.subscribe("runtime", accept);
    if (disposed) sub.unsubscribe();
    else subscription = sub;
  })().catch(() => {
    if (disposed) return;
    status.textContent = t("subscribeError");
    void reload();
  });
  return () => {
    disposed = true;
    requestSequence += 1;
    try {
      subscription?.unsubscribe();
    } finally {
      refresh.removeEventListener("click", reload);
      search.removeEventListener("input", render);
      sourceFilter.removeEventListener("change", render);
      root.remove();
    }
  };
}
