// machlib-status.js — render the CI-emitted status.json into the
// MachLib verification block.
//
// Contract (per the user's specification, 2026-06-14):
//   * Display status.json's own machlib_sha + generated_at_utc —
//     NEVER this page's load time.
//   * Lead with the gap (placeholder + open), not the win. The
//     dashboard should always print the 80%-open framing first;
//     the strengthened/proven counts are the detail underneath.
//   * Split `proven` into proven_from_mathlib vs
//     proven_mod_machlib_axioms — never a single "proven" total.
//   * If the fetch fails OR the JSON is structurally wrong, render
//     "status unavailable" loudly. NEVER silently fall back to a
//     cached or hard-coded number.
//   * Warn when the data is stale (>24h old by the JSON's own
//     generated_at_utc, not page-load time).

(function () {
  "use strict";

  const STATUS_URL =
    "https://raw.githubusercontent.com/agent-maestro/machlib/status-data/status.json";
  const STALENESS_WARN_HOURS = 24;
  const MACHLIB_REPO = "https://github.com/agent-maestro/machlib";

  const root = document.getElementById("machlib-status");
  if (!root) return;

  function escape(text) {
    const s = String(text);
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderUnavailable(reason) {
    root.setAttribute("data-state", "unavailable");
    root.innerHTML =
      '<div role="alert" style="border-left: 4px solid #b00020; padding: 0.6em 1em; background: #fff5f5;">' +
      "<p><strong>Verification status unavailable.</strong></p>" +
      "<p>" +
      escape(reason) +
      "</p>" +
      '<p>The raw data lives at <a href="' +
      STATUS_URL +
      '">' +
      escape(STATUS_URL) +
      "</a>. " +
      "This block intentionally refuses to render a cached or hard-coded fallback — a fresh page deploy over old data is the " +
      'exact "looks current, isn\'t" trap a verification dashboard exists to prevent.</p>' +
      "</div>";
  }

  function hoursBetween(then, now) {
    return (now.getTime() - then.getTime()) / 36e5;
  }

  function shaShort(sha) {
    if (typeof sha !== "string") return "?";
    return sha.slice(0, 7);
  }

  function renderStatus(data, fetchedAt) {
    // Structural validation. If any of the contract fields are
    // missing, refuse to render rather than silently substituting.
    const required = [
      "schema_version",
      "machlib_sha",
      "generated_at_utc",
      "content_hash_sha256",
      "build",
      "sorries",
      "verify_audit",
      "axiomatized_base",
    ];
    for (const k of required) {
      if (!(k in data)) {
        renderUnavailable(
          "Fetched status.json is missing required field: " + k
        );
        return;
      }
    }

    const generatedAt = new Date(data.generated_at_utc);
    if (isNaN(generatedAt.getTime())) {
      renderUnavailable(
        "Fetched status.json has unparseable generated_at_utc: " +
          data.generated_at_utc
      );
      return;
    }
    const ageHours = hoursBetween(generatedAt, fetchedAt);
    const isStale = ageHours > STALENESS_WARN_HOURS;

    const va = data.verify_audit;
    const sorries = data.sorries;
    const build = data.build;
    const axBase = data.axiomatized_base;
    const delta = (sorries && sorries.delta_vs_previous) || {};

    // Lead with the gap.
    const gap_pct = typeof va.gap_pct === "number" ? va.gap_pct : "?";
    const discharged_pct =
      typeof va.discharged_pct === "number" ? va.discharged_pct : "?";

    // Sorry delta arrow.
    let deltaHTML = "";
    if (typeof delta.net_change === "number") {
      const sign = delta.net_change > 0 ? "+" : delta.net_change < 0 ? "−" : "±";
      const colour =
        delta.net_change > 0
          ? "#b00020"
          : delta.net_change < 0
          ? "#0a6f2f"
          : "#5a5a5a";
      deltaHTML =
        '<span style="color: ' +
        colour +
        '; font-weight: 600;">' +
        sign +
        Math.abs(delta.net_change) +
        " vs prev (" +
        escape(delta.method) +
        ")" +
        "</span>";
    } else if (delta.method === "first_run") {
      deltaHTML = '<span style="color: #5a5a5a;">first CI run; no delta</span>';
    } else {
      deltaHTML = '<span style="color: #5a5a5a;">delta unavailable</span>';
    }

    // Staleness banner.
    let stalenessHTML = "";
    if (isStale) {
      stalenessHTML =
        '<div role="alert" style="border-left: 4px solid #b08000; padding: 0.4em 0.8em; background: #fffbe6; margin-bottom: 0.8em;">' +
        "<strong>Data is " +
        ageHours.toFixed(1) +
        "h old</strong> (older than the " +
        STALENESS_WARN_HOURS +
        "h freshness threshold). " +
        "A recent push may have failed CI, or no push has happened in a while. " +
        '<a href="' +
        MACHLIB_REPO +
        '/actions/workflows/status.yml">Check the workflow run history</a>.' +
        "</div>";
    }

    // Build status banner.
    let buildHTML = "";
    if (build.lake_build_passed === false) {
      buildHTML =
        '<div role="alert" style="border-left: 4px solid #b00020; padding: 0.4em 0.8em; background: #fff5f5; margin-bottom: 0.8em;">' +
        "<strong>lake build did not pass at " +
        shaShort(data.machlib_sha) +
        ".</strong> Exit code: " +
        escape(build.lake_exit_code) +
        ". " +
        "The verify-audit numbers below are extracted from source and may be inconsistent with what would compile. " +
        "Treat them as suspect until the build is green." +
        "</div>";
    }

    root.setAttribute("data-state", "ok");
    root.innerHTML =
      stalenessHTML +
      buildHTML +
      // Top-line: lead with the gap.
      '<div style="display: flex; gap: 1.5em; flex-wrap: wrap; margin-bottom: 0.8em;">' +
      '  <div><strong style="font-size: 1.4em; color: #b00020;">' +
      escape(gap_pct) +
      "%</strong> of Forge <code>@verify</code> obligations are <em>open</em> (placeholder + sorry).</div>" +
      '  <div><strong style="font-size: 1.4em; color: #0a6f2f;">' +
      escape(discharged_pct) +
      "%</strong> are discharged (strengthened + proven-mod-axioms).</div>" +
      "</div>" +
      "<ul>" +
      // Verify audit breakdown.
      "  <li>Forge <code>@verify</code> obligations: <code>" +
      escape(va.total) +
      "</code> total" +
      "    <ul>" +
      "      <li><strong>open</strong>: <code>" +
      escape(va.open) +
      "</code> <small>(Discovered/ stub body contains <code>sorry</code>, or no stub exists yet)</small></li>" +
      "      <li><strong>placeholder</strong>: <code>" +
      escape(va.placeholder) +
      "</code> <small>(Discovered/ stub body is <code>True := by trivial</code> — a vacuous stand-in)</small></li>" +
      "      <li>strengthened: <code>" +
      escape(va.strengthened) +
      "</code> <small>(hand-authored Applications/ proof discharges the obligation; build-verified)</small></li>" +
      "      <li>proven from mathlib: <code>" +
      escape(va.proven_from_mathlib) +
      "</code> <small>(structurally 0 — MachLib has zero mathlib dependency by design)</small></li>" +
      "      <li>proven modulo MachLib axioms: <code>" +
      escape(va.proven_mod_machlib_axioms) +
      "</code> <small>(Forge-emitted stub already carries a concrete proof using MachLib's foundation lemmas — <em>conditional on the axiomatized analytic base</em>; see below)</small></li>" +
      "    </ul>" +
      "  </li>" +
      // Sorries.
      "  <li>MachLib sorries: core <code>" +
      escape(sorries.core) +
      "</code> · discovered <code>" +
      escape(sorries.discovered) +
      "</code> · total <code>" +
      escape(sorries.total) +
      "</code> · this cycle " +
      deltaHTML +
      '    <small>(method: <a href="' +
      MACHLIB_REPO +
      '/blob/master/tools/status/generate_status.py">' +
      "strip block + line comments, count <code>\\bsorry\\b</code>, all non-core .lean under foundations/MachLib/ excluding Test.lean</a>)</small>" +
      "  </li>" +
      // Axiomatized base.
      "  <li>Axiomatized analytic base: <code>" +
      escape(axBase.machlib_real_axioms_count) +
      "</code> <code>MachLib.Real.*</code> axioms load-bearing across the headline theorems " +
      '<small>(each is a theorem in mathlib; grounding here is open work — see <a href="' +
      MACHLIB_REPO +
      "/blob/" +
      escape(data.machlib_sha) +
      '/foundations/AxiomAudit.lean">AxiomAudit.lean</a>)</small>' +
      "  </li>" +
      "</ul>" +
      // Provenance.
      '<p style="margin-top: 0.8em; padding-top: 0.5em; border-top: 1px solid #eee; font-size: 0.9em; color: #555;">' +
      "Data SHA: <code>" +
      escape(data.machlib_sha) +
      "</code> &middot; " +
      "generated at: <code>" +
      escape(data.generated_at_utc) +
      "</code> " +
      "(" +
      ageHours.toFixed(1) +
      "h ago) &middot; " +
      "content hash: <code>" +
      escape(data.content_hash_sha256.slice(0, 16)) +
      "…</code> &middot; " +
      '<a href="' +
      STATUS_URL +
      '">raw status.json</a> &middot; ' +
      '<a href="' +
      MACHLIB_REPO +
      "/commit/" +
      escape(data.machlib_sha) +
      '">commit ' +
      shaShort(data.machlib_sha) +
      "</a>" +
      "</p>";
  }

  // Cache-bust the raw.githubusercontent.com response so a browser
  // can't show a stale snapshot. The query param is ignored by GitHub
  // but defeats Cache-Control on the client side.
  const url = STATUS_URL + "?t=" + Date.now();
  fetch(url, { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error(
          "GitHub returned HTTP " + response.status + " for status.json"
        );
      }
      return response.json();
    })
    .then(function (data) {
      renderStatus(data, new Date());
    })
    .catch(function (err) {
      renderUnavailable(
        "Fetch failed: " +
          (err && err.message ? err.message : String(err)) +
          ". The status-data branch may not exist yet (the workflow runs on " +
          "every push to master), or GitHub's raw endpoint is rate-limiting."
      );
    });
})();
