// ESM configuration panel plus an explicitly user-triggered input action.
// No top-level network calls, draft persistence, provider keys or DOM writes.
const STRATEGIES = {
  faithful: "Improve clarity and resolve ambiguity conservatively. Preserve all original intent, facts, constraints and uncertainty; never add requirements.",
  structured: "Organize the task's existing objectives, context, constraints and output requirements into a coherent order. Omit missing information instead of inventing it.",
  concise: "Remove repetition and redundant wording while preserving every meaningful requirement, qualifier, fact and uncertainty.",
  custom: "Use the user's optimization instructions without adding an extra preset strategy.",
};
const LENGTHS = {
  preserve: "Keep the result approximately as long as the draft where practical; never discard valid constraints to hit a length target.",
  expand: "Expand only to explain existing intent or constraints more clearly. Do not add facts, examples, requirements or assumptions.",
  concise: "Prefer the shortest wording that retains the full intent and all valid constraints.",
};
const STRUCTURES = {
  natural: "Use clear natural-language paragraphs, with no unnecessary template headings.",
  structured: "Use concise sections or bullets for the information that actually exists. Omit empty or unevidenced sections.",
};

const defaults = (api) => ({
  schema: 2,
  strategy: "faithful",
  optimizationPrompt: api.t("defaultPrompt"),
  contextMode: "recent",
  contextRounds: 3,
  model: "",
  length: "preserve",
  structure: "natural",
  autoApply: true,
});

const normalize = (api, raw) => {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const base = defaults(api);
  return {
    ...base,
    strategy: Object.hasOwn(STRATEGIES, value.strategy) ? value.strategy : base.strategy,
    optimizationPrompt: typeof value.optimizationPrompt === "string" ? value.optimizationPrompt : base.optimizationPrompt,
    contextMode: ["recent", "draft"].includes(value.contextMode) ? value.contextMode : base.contextMode,
    contextRounds: Number.isInteger(value.contextRounds) ? Math.max(1, Math.min(10, value.contextRounds)) : base.contextRounds,
    model: typeof value.model === "string" ? value.model : base.model,
    length: Object.hasOwn(LENGTHS, value.length) ? value.length : base.length,
    structure: Object.hasOwn(STRUCTURES, value.structure) ? value.structure : base.structure,
    autoApply: typeof value.autoApply === "boolean" ? value.autoApply : base.autoApply,
  };
};

const buildInstructions = (api, prefs) => {
  if (!prefs.optimizationPrompt.trim()) throw new Error(api.t("promptRequired"));
  if (Array.from(prefs.optimizationPrompt).length > 7000 || prefs.model.length > 512) {
    throw new Error(api.t("settingsTooLong"));
  }
  const text = [
    prefs.optimizationPrompt.trim(),
    "Selected strategy:\n" + STRATEGIES[prefs.strategy],
    "Length preference:\n" + LENGTHS[prefs.length],
    "Presentation preference:\n" + STRUCTURES[prefs.structure],
  ].join("\n\n");
  if (Array.from(text).length > 8000) throw new Error(api.t("settingsTooLong"));
  return text;
};

const supported = (api) => {
  const ids = new Set((api.write?.domains?.() ?? []).flatMap((domain) =>
    domain.actions.filter((action) => action.granted).map((action) => action.id)));
  return typeof api.ai?.optimizePrompt === "function" &&
    ["chatInput.captureDraft", "chatInput.applyDraft", "chatInput.restoreDraft"].every((id) => ids.has(id));
};

const checkActive = (signal) => {
  if (signal.aborted) throw new DOMException("Optimization cancelled", "AbortError");
};

// Host invokes this export only on a toolbar click. Every click gets a fresh
// API/storage snapshot, independently of the configuration panel's lifecycle.
export async function optimizeDraft({ api, signal, onStatus, confirm }) {
  if (!supported(api)) throw new Error(api.t("unavailable"));
  checkActive(signal);
  let prefs;
  try { prefs = normalize(api, await api.storage.getJson("preferences", {})); }
  catch { throw new Error(api.t("settingsError")); }
  const optimizationInstructions = buildInstructions(api, prefs);
  checkActive(signal);
  const captured = await api.write.run("chatInput.captureDraft", {});
  if (!captured.ok || !captured.data?.draftToken) throw new Error(api.t("captureError"));
  const draft = captured.data;
  if (!draft.text?.trim()) throw new Error(api.t("empty"));
  const includeContext = prefs.contextMode === "recent" && Boolean(draft.conversationId);
  const acknowledgment = await api.storage.getJson("privacyAcknowledgment", null);
  checkActive(signal);
  // Confirm once per disclosure revision and actual history-sharing mode.
  if (acknowledgment?.version !== 2 || acknowledgment.includeContext !== includeContext) {
    const accepted = await confirm(api.t(includeContext ? "confirmWithContext" : "confirmDraftOnly"));
    checkActive(signal);
    if (!accepted) return { message: api.t("cancelled") };
    try { await api.storage.setJson("privacyAcknowledgment", { version: 2, includeContext }); }
    catch { throw new Error(api.t("settingsError")); }
  }
  checkActive(signal);
  onStatus(api.t("generating"));
  let output;
  try {
    output = await api.ai.optimizePrompt({
      draft: draft.text,
      conversationId: draft.conversationId ?? undefined,
      model: prefs.model.trim() || undefined,
      contextRounds: prefs.contextRounds,
      includeContext,
      optimizationInstructions,
      signal,
    });
  } catch (error) {
    if (signal.aborted || error?.name === "AbortError") throw new DOMException("Optimization cancelled", "AbortError");
    throw new Error(api.t("generateError"));
  }
  checkActive(signal);
  if (typeof output?.content !== "string" || !output.content.trim()) throw new Error(api.t("generateError"));
  const preview = output.content;
  let used = false;
  const apply = async () => {
    checkActive(signal);
    if (used) return { message: api.t("applyError"), preview };
    used = true;
    // Never recapture and overwrite newer user text when this token is stale.
    let applied;
    try { applied = await api.write.run("chatInput.applyDraft", { draftToken: draft.draftToken, text: preview }); }
    catch { checkActive(signal); return { message: api.t("applyError"), preview }; }
    checkActive(signal);
    if (!applied.ok || !applied.data?.restoreToken) return { message: api.t("applyError"), preview };
    let restored = false;
    return {
      message: api.t("applied"),
      undo: async () => {
        checkActive(signal);
        if (restored) throw new Error(api.t("restoreError"));
        restored = true;
        const response = await api.write.run("chatInput.restoreDraft", { restoreToken: applied.data.restoreToken });
        if (!response.ok) throw new Error(api.t("restoreError"));
      },
    };
  };
  return prefs.autoApply ? await apply() : { message: api.t("previewReady"), preview, apply };
}

// The right panel is configuration only. Opening or saving it never calls AI.
export default function PromptOptimizerSettings({ api }) {
  const { createElement: h, useState, useEffect, useRef } = api.ui.React;
  const t = (key) => api.t(key);
  const [prefs, setPrefs] = useState(() => defaults(api));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("ready");
  const [resetPending, setResetPending] = useState(false);
  const mounted = useRef(false);
  const saveLock = useRef(false);
  useEffect(() => {
    let alive = true;
    mounted.current = true;
    setLoaded(false);
    setResetPending(false);
    saveLock.current = false;
    api.storage.getJson("preferences", {}).then((value) => {
      if (alive) { setPrefs(normalize(api, value)); setLoaded(true); }
    }).catch(() => { if (alive) setStatus("settingsError"); });
    return () => { alive = false; mounted.current = false; };
  }, [api]);
  const change = (patch) => { setPrefs((previous) => ({ ...previous, ...patch })); setStatus("unsaved"); };
  const save = async (value = prefs) => {
    if (!loaded || saveLock.current) return;
    try { buildInstructions(api, value); }
    catch { setStatus(!value.optimizationPrompt.trim() ? "promptRequired" : "settingsTooLong"); return; }
    saveLock.current = true;
    setSaving(true);
    try {
      await api.storage.setJson("preferences", value);
      if (mounted.current) { setPrefs(value); setStatus("saved"); setResetPending(false); }
    } catch { if (mounted.current) setStatus("settingsError"); }
    finally { saveLock.current = false; if (mounted.current) setSaving(false); }
  };
  const field = (key, node) => h("label", null, t(key), node);
  const select = (key, values, disabled = false) => h("select", {
    value: prefs[key], disabled: !loaded || saving || disabled,
    onChange: (event) => change({ [key]: event.target.value }),
  }, ...values.map((value) => h("option", { key: value, value }, t(key + "." + value))));
  const instructions = (() => { try { return buildInstructions(api, prefs); } catch { return t("settingsTooLong"); } })();
  return h("section", { className: "snow-po-settings", "aria-label": t("title") },
    h("header", null, h("h2", null, t("title")), h("p", { className: "po-muted" }, t("subtitle"))),
    !supported(api) && h("div", { className: "po-status po-warning", role: "alert" }, t("unavailable")),
    h("div", { className: "po-card" },
      h("strong", null, t("workflowTitle")), h("p", { className: "po-muted" }, t("workflow")),
      h("p", { className: "po-muted" }, t("privacy"))),
    h("div", { className: "po-card" },
      field("strategy", select("strategy", Object.keys(STRATEGIES))),
      h("p", { className: "po-muted" }, t("strategyHelp")),
      field("optimizationPrompt", h("textarea", { value: prefs.optimizationPrompt, disabled: !loaded || saving,
        maxLength: 14000, rows: 8, spellCheck: false, onChange: (event) => change({ optimizationPrompt: event.target.value }) })),
      h("p", { className: "po-muted" }, t("promptHelp")),
      field("length", select("length", Object.keys(LENGTHS))),
      field("structure", select("structure", Object.keys(STRUCTURES)))),
    h("div", { className: "po-card" },
      field("contextMode", select("contextMode", ["recent", "draft"])),
      prefs.contextMode === "recent" && field("rounds", h("input", { type: "number", min: 1, max: 10, step: 1, value: prefs.contextRounds,
        disabled: !loaded || saving, onChange: (event) => change({ contextRounds: Math.max(1, Math.min(10, Math.trunc(Number(event.target.value) || 1))) }) })),
      field("model", h("input", { type: "text", value: prefs.model, maxLength: 512, disabled: !loaded || saving, placeholder: t("modelPlaceholder"),
        onChange: (event) => change({ model: event.target.value }) })),
      h("label", { className: "po-check" }, h("input", { type: "checkbox", checked: prefs.autoApply, disabled: !loaded || saving,
        onChange: (event) => change({ autoApply: event.target.checked }) }), t("autoApply")),
      h("p", { className: "po-muted" }, t("autoApplyHelp"))),
    h("div", { className: "po-actions" },
      h("button", { type: "button", className: "po-primary", disabled: !loaded || saving, onClick: () => save() }, t(saving ? "saving" : "save")),
      h("button", { type: "button", disabled: !loaded || saving, onClick: () => setResetPending(true) }, t("reset"))),
    resetPending && h("div", { className: "po-card" }, h("p", null, t("resetWarning")), h("div", { className: "po-actions" },
      h("button", { type: "button", disabled: saving, onClick: () => save(defaults(api)) }, t("confirmReset")),
      h("button", { type: "button", disabled: saving, onClick: () => setResetPending(false) }, t("cancel")))),
    h("div", { className: "po-status", role: "status", "aria-live": "polite" }, t(status)),
    h("details", null, h("summary", null, t("effectiveInstructions")), h("pre", { className: "po-preview" }, instructions)),
    h("p", { className: "po-muted" }, t("safety")));
}
