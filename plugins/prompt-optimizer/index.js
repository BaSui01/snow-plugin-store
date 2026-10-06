// ESM configuration panel plus an explicitly user-triggered input action.
// No top-level network calls, draft persistence, provider keys or DOM writes.
const STRATEGIES = {
  faithful: "Improve clarity conservatively. Clarify ambiguity only when supported by the draft or reference context; otherwise preserve it. Preserve all intent, facts, constraints and uncertainty; never add requirements.",
  structured: "Organize the task's existing objectives, context, constraints and output requirements into a coherent order. Follow the presentation preference rather than imposing headings. Omit missing information instead of inventing it.",
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
  apiProfile: "",
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
    apiProfile: typeof value.apiProfile === "string" ? value.apiProfile : base.apiProfile,
    model: typeof value.model === "string" ? value.model : base.model,
    length: Object.hasOwn(LENGTHS, value.length) ? value.length : base.length,
    structure: Object.hasOwn(STRUCTURES, value.structure) ? value.structure : base.structure,
    autoApply: typeof value.autoApply === "boolean" ? value.autoApply : base.autoApply,
  };
};

const readProfiles = async (api) => {
  try {
    const response = await api.metadata.get("apiProfiles");
    const profiles = response?.domains?.apiProfiles;
    if (response?.denied?.apiProfiles || !Array.isArray(profiles) ||
        profiles.some((profile) => !profile || typeof profile.profileName !== "string" || !profile.profileName.trim())) {
      throw new Error("Invalid API profile metadata");
    }
    return profiles.map((profile) => ({
      profileName: profile.profileName,
      displayName: typeof profile.displayName === "string" && profile.displayName.trim() ? profile.displayName : profile.profileName,
      isActive: profile.isActive === true,
      basicModel: typeof profile.basicModel === "string" && profile.basicModel.trim() ? profile.basicModel : "",
      models: [...new Set([profile.basicModel, profile.advancedModel].filter((model) => typeof model === "string" && model.trim()))],
    }));
  } catch { throw new Error(api.t("profilesError")); }
};

const selectionError = (profiles, prefs) => {
  if (!profiles.length) return "profilesEmpty";
  if (!prefs.apiProfile && !prefs.model) {
    const activeProfiles = profiles.filter((item) => item.isActive);
    if (activeProfiles.length !== 1) return "activeProfileUnavailable";
    if (!activeProfiles[0].basicModel) return "basicModelUnavailable";
  }
  const profile = profiles.find((item) => item.profileName === prefs.apiProfile);
  if (!profile) return prefs.apiProfile ? "profileInvalid" : "profileRequired";
  if (!profile.models.length) return "modelsEmpty";
  if (!profile.models.includes(prefs.model)) return prefs.model ? "modelInvalid" : "modelRequired";
  return "";
};

const buildInstructions = (api, prefs) => {
  if (!prefs.optimizationPrompt.trim()) throw new Error(api.t("promptRequired"));
  if (Array.from(prefs.optimizationPrompt).length > 7000) {
    throw new Error(api.t("settingsTooLong"));
  }
  const text = [
    "Apply these preferences together: the strategy sets the editing focus, length sets detail, and presentation sets the format. Preserve all meaningful constraints and uncertainty before style or length targets; do not pad the result just to preserve length.",
    "Optimization rules:\n" + prefs.optimizationPrompt.trim(),
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
export async function optimizeDraft({ api, signal, onStatus }) {
  if (!supported(api)) throw new Error(api.t("unavailable"));
  checkActive(signal);
  let prefs;
  try { prefs = normalize(api, await api.storage.getJson("preferences", {})); }
  catch { throw new Error(api.t("settingsError")); }
  onStatus(api.t("profilesLoading"));
  const profiles = await readProfiles(api);
  checkActive(signal);
  const invalidSelection = selectionError(profiles, prefs);
  if (invalidSelection) throw new Error(api.t(invalidSelection));
  const optimizationInstructions = buildInstructions(api, prefs);
  checkActive(signal);
  const captured = await api.write.run("chatInput.captureDraft", {});
  if (!captured.ok || !captured.data?.draftToken) throw new Error(api.t("captureError"));
  const draft = captured.data;
  if (!draft.text?.trim()) throw new Error(api.t("empty"));
  const includeContext = prefs.contextMode === "recent" && Boolean(draft.conversationId);
  checkActive(signal);
  onStatus(api.t("generating"));
  let output;
  try {
    output = await api.ai.optimizePrompt({
      draft: draft.text,
      conversationId: draft.conversationId ?? undefined,
      apiProfile: prefs.apiProfile,
      model: prefs.model,
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
  const [profiles, setProfiles] = useState([]);
  const [profilesStatus, setProfilesStatus] = useState("profilesLoading");
  const [profilesRetry, setProfilesRetry] = useState(0);
  const [profilesFeedback, setProfilesFeedback] = useState("");
  const profilesLock = useRef(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("loading");
  const [dirty, setDirty] = useState(false);
  const [retry, setRetry] = useState(0);
  const [resetPending, setResetPending] = useState(false);
  const mounted = useRef(false);
  const saveLock = useRef(false);
  useEffect(() => {
    let alive = true;
    mounted.current = true;
    setLoaded(false);
    setStatus("loading");
    setDirty(false);
    setResetPending(false);
    saveLock.current = false;
    api.storage.getJson("preferences", {}).then((value) => {
      if (alive) { setPrefs(normalize(api, value)); setLoaded(true); setStatus("ready"); }
    }).catch(() => { if (alive) setStatus("settingsError"); });
    return () => { alive = false; mounted.current = false; };
  }, [api, retry]);
  useEffect(() => {
    let alive = true;
    profilesLock.current = true;
    setProfilesStatus("profilesLoading");
    setProfilesFeedback("");
    // Each attempt reaches the host collector; never reuse a panel snapshot.
    readProfiles(api).then((items) => {
      if (alive) {
        setProfiles(items);
        setProfilesStatus("");
        setProfilesFeedback(profilesRetry ? "profilesReloaded" : "");
      }
    }).catch(() => {
      if (alive) { setProfiles([]); setProfilesStatus("profilesError"); }
    }).finally(() => { if (alive) profilesLock.current = false; });
    return () => { alive = false; };
  }, [api, profilesRetry]);
  useEffect(() => {
    if (!loaded || profilesStatus || prefs.apiProfile || prefs.model) return;
    const activeProfiles = profiles.filter((item) => item.isActive);
    if (activeProfiles.length !== 1) return;
    const active = activeProfiles[0];
    if (!active.basicModel) return;
    // A default is an unsaved panel choice, never a migration or storage write.
    setPrefs((previous) => previous.apiProfile || previous.model ? previous : {
      ...previous, apiProfile: active.profileName, model: active.basicModel,
    });
    setDirty(true);
    setStatus("unsaved");
  }, [loaded, profilesStatus, profiles, prefs.apiProfile, prefs.model]);
  const refreshProfiles = () => {
    if (saveLock.current || profilesLock.current) return;
    profilesLock.current = true;
    setProfilesStatus("profilesLoading");
    setProfilesFeedback("");
    setProfilesRetry((value) => value + 1);
  };
  const profile = profiles.find((item) => item.profileName === prefs.apiProfile);
  const models = profile?.models ?? [];
  const modelStatus = profilesStatus || selectionError(profiles, prefs);
  const change = (patch) => { setPrefs((previous) => ({ ...previous, ...patch })); setDirty(true); setStatus("unsaved"); };
  const save = async (value = prefs) => {
    if (!loaded || saveLock.current || profilesStatus) return;
    const invalidSelection = selectionError(profiles, value);
    if (invalidSelection) { setStatus(invalidSelection); return; }
    try { buildInstructions(api, value); }
    catch { setStatus(!value.optimizationPrompt.trim() ? "promptRequired" : "settingsTooLong"); return; }
    saveLock.current = true;
    setSaving(true);
    try {
      await api.storage.setJson("preferences", value);
      if (mounted.current) { setPrefs(value); setDirty(false); setStatus("saved"); setResetPending(false); }
    } catch { if (mounted.current) setStatus("settingsError"); }
    finally { saveLock.current = false; if (mounted.current) setSaving(false); }
  };
  const field = (key, node) => h("label", { className: "po-field" }, h("span", null, t(key)), node);
  const select = (key, values) => h("select", {
    value: prefs[key], disabled: !loaded || saving,
    onChange: (event) => change({ [key]: event.target.value }),
  }, ...values.map((value) => h("option", { key: value, value }, t(key + "." + value))));
  const instructions = (() => { try { return buildInstructions(api, prefs); } catch { return t(!prefs.optimizationPrompt.trim() ? "promptRequired" : "settingsTooLong"); } })();
  const count = Array.from(prefs.optimizationPrompt).length;
  const details = (title, ...content) => h("details", { className: "po-details" }, h("summary", null, t(title)), ...content);
  return h("section", { className: "snow-po-settings", "aria-label": t("title"), "aria-busy": saving || status === "loading" || profilesStatus === "profilesLoading" },
    h("header", { className: "po-header" },
      h("span", { className: "po-icon", "aria-hidden": true }, "✦"),
      h("h2", null, t("title"))),
    !supported(api) && h("div", { className: "po-status po-warning", role: "alert" }, t("unavailable")),
    h("p", { className: "po-disclosure" }, t("privacy")),
    h("div", { className: "po-card" },
      h("h3", null, t("rulesTitle")),
      field("strategy", select("strategy", Object.keys(STRATEGIES))),
      field("optimizationPrompt", h("textarea", { value: prefs.optimizationPrompt, disabled: !loaded || saving,
        maxLength: 14000, rows: 6, spellCheck: false, "aria-invalid": count > 7000,
        onChange: (event) => change({ optimizationPrompt: event.target.value }) })),
      h("div", { className: "po-counter" + (count > 7000 ? " po-over-limit" : "") }, count + " / 7000 · " + t("codePoints")),
      h("div", { className: "po-grid" }, field("length", select("length", Object.keys(LENGTHS))), field("structure", select("structure", Object.keys(STRUCTURES))))),
    h("div", { className: "po-card" },
      h("h3", null, t("contextTitle")),
      h("div", { className: "po-grid" },
        field("contextMode", select("contextMode", ["recent", "draft"])),
        prefs.contextMode === "recent" && field("rounds", h("input", { type: "number", min: 1, max: 10, step: 1, value: prefs.contextRounds,
          disabled: !loaded || saving, onChange: (event) => change({ contextRounds: Math.max(1, Math.min(10, Math.trunc(Number(event.target.value) || 1))) }) }))),
      h("div", { className: "po-grid" },
        field("apiProfile", h("select", { value: profile ? prefs.apiProfile : "", disabled: !loaded || saving || Boolean(profilesStatus) || !profiles.length,
          onChange: (event) => {
            const selected = profiles.find((item) => item.profileName === event.target.value);
            if (selected) change({ apiProfile: selected.profileName, model: selected.basicModel });
          } },
          h("option", { value: "", disabled: true }, t("profileRequired")),
          ...profiles.map((item) => h("option", { key: item.profileName, value: item.profileName }, item.displayName)))),
        field("model", h("select", { value: models.includes(prefs.model) ? prefs.model : "", disabled: !loaded || saving || Boolean(profilesStatus) || !models.length,
          onChange: (event) => { if (models.includes(event.target.value)) change({ model: event.target.value }); } },
          h("option", { value: "", disabled: true }, t("modelRequired")),
          ...models.map((model) => h("option", { key: model, value: model }, model))))),
      (profilesFeedback || modelStatus) && h("div", { className: "po-status", role: "status", "aria-live": "polite", "aria-atomic": true },
        profilesFeedback && h("p", null, t(profilesFeedback)),
        modelStatus && h("p", null, t(modelStatus))),
      h("button", { type: "button", disabled: saving || profilesStatus === "profilesLoading", onClick: refreshProfiles },
        t(profilesStatus === "profilesLoading" ? "profilesLoading" : "profilesRetry"))),
    h("div", { className: "po-card" }, h("h3", null, t("fillTitle")),
      h("label", { className: "po-check" }, h("input", { type: "checkbox", checked: prefs.autoApply, disabled: !loaded || saving,
        onChange: (event) => change({ autoApply: event.target.checked }) }), t("autoApply"))),
    details("workflowTitle", h("p", null, t("workflow")), h("p", null, t("strategyHelp")),
      h("p", null, t("promptHelp")), h("p", null, t("autoApplyHelp")), h("p", null, t("safety"))),
    details("effectiveInstructions", h("pre", { className: "po-preview" }, instructions)),
    resetPending && h("div", { className: "po-card" }, h("p", null, t("resetWarning")), h("div", { className: "po-actions" },
      h("button", { type: "button", disabled: saving || Boolean(modelStatus), onClick: () => save({ ...defaults(api), apiProfile: prefs.apiProfile, model: prefs.model }) }, t("confirmReset")),
      h("button", { type: "button", disabled: saving, onClick: () => setResetPending(false) }, t("cancel")))),
    h("footer", { className: "po-footer" },
      h("div", { className: "po-status", role: "status", "aria-live": "polite" }, t(saving ? "saving" : status),
        dirty && status !== "unsaved" && h("p", { className: "po-muted" }, t("unsaved"))),
      h("div", { className: "po-actions" },
        !loaded && status === "settingsError" && h("button", { type: "button", onClick: () => setRetry((value) => value + 1) }, t("retry")),
        h("button", { type: "button", className: "po-primary", disabled: !loaded || saving || Boolean(modelStatus), onClick: () => save() }, t(saving ? "saving" : "save")),
        h("button", { type: "button", disabled: !loaded || saving, onClick: () => setResetPending(true) }, t("reset")))));
}
